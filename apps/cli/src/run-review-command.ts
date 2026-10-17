import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { PullRequestRef, ReviewResult } from '@noslop/contract';
import { reviewResultSchema } from '@noslop/contract';
import { readPullRequestState } from '@noslop/github';
import { runReview } from '@noslop/review';
import { buildConfiguredAdapter } from './build-configured-adapter';
import type { CLIContext } from './cli-context';
import { formatReviewSummary } from './format-review-summary';
import { loadRepoConfig } from './load-repo-config';
import { runReporters } from './run-reporters';

export interface ReviewValues {
  base: string | undefined;
  head: string | undefined;
  pr: string | undefined;
  repo: string | undefined;
  report: string | undefined;
  json: boolean;
  push: boolean;
  adapter: string | undefined;
}

// reviews the change between 2 commits of the repo that holds the working directory, or a pull
// request of it, in a temp folder under the user's cache that the command removes whether the review
// passes or fails; it exits 1 when the review cannot run or a reporter fails
export async function runReviewCommand(values: ReviewValues, ctx: CLIContext): Promise<number> {
  const repoDir = await readGitText(ctx, ctx.cwd, ['rev-parse', '--show-toplevel']);
  const loaded = await loadRepoConfig(ctx, repoDir);

  const change =
    values.pr === undefined
      ? await resolveLocalChange(ctx, repoDir, values)
      : await resolvePullRequestChange(ctx, repoDir, values);

  const adapterID = values.adapter ?? loaded.config.adapter ?? 'codex';

  const adapter = buildConfiguredAdapter(
    ctx.createAdapter(adapterID),
    loaded.config.adapters[adapterID] ?? {},
  );

  const reviewsDir = join(ctx.cacheDir, 'reviews');

  await mkdir(reviewsDir, { recursive: true });

  const tempDir = await mkdtemp(join(reviewsDir, 'review-'));

  let result: ReviewResult;

  try {
    const run = await runReview({
      runner: ctx.runner,
      repoDir,
      repo: change.repo,
      base: change.base,
      head: change.head,
      config: loaded.config,
      configHash: loaded.hash,
      rules: loaded.rules,
      adapter,
      logger: ctx.logger,
      tempDir,
      cacheDir: join(ctx.cacheDir, 'index'),
      title: change.title,
      body: change.body,
      linkedIssue: null,
      pullRequest: change.pullRequest,
      isPush: values.push,
      pastEscapes: [],
      ...(ctx.now === undefined ? {} : { now: ctx.now }),
    });

    for (const item of run.dropped) {
      ctx.logger.info('dropped a {lens} finding, {reason}: {title}', item);
    }

    result = reviewResultSchema.parse(run.result);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  if (values.json) {
    ctx.writeStdout(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    ctx.writeStdout(formatReviewSummary(result));
  }

  const reporters = values.report?.split(',').map((id) => id.trim()) ?? loaded.config.report;

  const failed = await runReporters(result, loaded.config, ctx, reporters);

  return failed.length > 0 ? 1 : 0;
}

interface ResolvedChange {
  repo: string;
  base: string;
  head: string;
  title: string;
  body: string;
  pullRequest: PullRequestRef | null;
}

async function resolveLocalChange(
  ctx: CLIContext,
  repoDir: string,
  values: ReviewValues,
): Promise<ResolvedChange> {
  const head = values.head ?? 'HEAD';

  const defaultBase =
    values.base === undefined ? await resolveDefaultBase(ctx, repoDir, head) : null;

  const base = values.base ?? defaultBase ?? head;

  // the title is the head commit's subject, and the body holds every commit message of the change,
  // oldest first, so the intent lens reads the whole branch and not its last commit alone
  const title = await readGitText(ctx, repoDir, ['log', '-1', '--format=%s', head]);

  const body = await readGitText(ctx, repoDir, [
    'log',
    '--reverse',
    '--format=%B',
    `${base}..${head}`,
  ]);

  return { repo: await readRepoName(ctx, repoDir), base, head, title, body, pullRequest: null };
}

// a pull request's change from GitHub: its title and body, its head, and its base; once noslop has
// reviewed an earlier head of it, the base is that head, so a re-review covers only the new commits
async function resolvePullRequestChange(
  ctx: CLIContext,
  repoDir: string,
  values: ReviewValues,
): Promise<ResolvedChange> {
  if (values.base !== undefined || values.head !== undefined) {
    throw new Error(
      '--pr takes the base and the head from the pull request; leave out --base and --head',
    );
  }

  const number = Number(values.pr);

  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`--pr takes a pull request number, not ${values.pr ?? ''}`);
  }

  const origin = await readRepoName(ctx, repoDir);

  const repo = values.repo ?? origin;
  const [owner, name] = repo.split('/');

  if (owner === undefined || name === undefined || owner === '' || name === '') {
    throw new Error(`--pr needs the repo as owner/name; pass --repo, not ${repo}`);
  }

  const pullRequest = { owner, repo: name, number };

  const client = await ctx.loadGitHubClient();
  const state = await readPullRequestState(client, pullRequest);

  const reviewed = state.summary?.marker.head ?? null;

  await ctx.runner.run(
    [
      'git',
      'fetch',
      '--quiet',
      'origin',
      state.baseSha,
      state.headSha,
      ...(reviewed === null ? [] : [reviewed]),
    ],
    { cwd: repoDir },
  );

  const start = await readGitText(ctx, repoDir, ['merge-base', state.baseSha, state.headSha]);

  const ancestry = await ctx.runner.run(
    ['git', 'merge-base', '--is-ancestor', reviewed ?? state.headSha, state.headSha],
    { cwd: repoDir },
  );

  const isDelta = reviewed !== null && reviewed !== state.headSha && ancestry.exitCode === 0;

  return {
    repo,
    base: isDelta ? reviewed : start,
    head: state.headSha,
    title: state.title,
    body: state.body,
    pullRequest,
  };
}

async function readGitText(ctx: CLIContext, cwd: string, args: readonly string[]): Promise<string> {
  const result = await ctx.runner.run(['git', ...args], { cwd });

  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}

// the change a branch makes is the one since it left the remote's default branch, or main when the
// repo has no remote
async function resolveDefaultBase(ctx: CLIContext, repoDir: string, head: string): Promise<string> {
  for (const branch of ['origin/HEAD', 'main', 'master']) {
    const result = await ctx.runner.run(['git', 'merge-base', head, branch], { cwd: repoDir });

    if (result.exitCode === 0) {
      return result.stdout.trim();
    }
  }

  throw new Error('noslop cannot find the branch the change starts from; pass --base');
}

// owner/repo from the origin remote's URL, or the folder name when the repo has no remote
async function readRepoName(ctx: CLIContext, repoDir: string): Promise<string> {
  const result = await ctx.runner.run(['git', 'remote', 'get-url', 'origin'], { cwd: repoDir });

  const match = /[:/](?<owner>[^/:]+)\/(?<repo>[^/]+?)(?:\.git)?$/u.exec(result.stdout.trim());
  const owner = match?.groups?.['owner'];
  const repo = match?.groups?.['repo'];

  return result.exitCode === 0 && owner !== undefined && repo !== undefined
    ? `${owner}/${repo}`
    : basename(repoDir);
}
