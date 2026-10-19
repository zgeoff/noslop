import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { EarlierFinding, PullRequestRef, ReviewResult } from '@noslop/contract';
import { reviewResultSchema } from '@noslop/contract';
import type { GitHubConnection, PullRequestState, SummaryMarker } from '@noslop/github';
import { readLinkedIssue, readPullRequestState, readThreadDispositions } from '@noslop/github';
import type { AnsweredFix } from '@noslop/review';
import { runFixesOnlyReview, runReview } from '@noslop/review';
import { loadStore, readEscapePaths } from '@noslop/sqlite';
import { buildConfiguredAdapter } from './build-configured-adapter';
import type { CLIContext } from './cli-context';
import { formatReviewSummary } from './format-review-summary';
import { getStorePath } from './get-store-path';
import { loadRepoConfig } from './load-repo-config';
import { runReporters } from './run-reporters';

export interface ReviewValues {
  base: string | undefined;
  head: string | undefined;
  pr: string | undefined;
  full: boolean;

  // a run after the last review round that runs no lens: it asks of each `fixed` answer whether the
  // commits since the last reviewed head fix the finding, and raises no finding
  fixesOnly: boolean;
  repo: string | undefined;
  report: string | undefined;
  json: boolean;
  push: boolean;
  adapter: string | undefined;

  // a file whose text is the linked issue, so an issue that lives outside GitHub reaches the intent
  // lens; without it, a pull request's linked issue is the GitHub issue its body closes
  issueFile: string | undefined;
}

// reviews the change between 2 commits of the repo that holds the working directory, or a pull
// request of it, in a temp folder under the user's cache that the command removes whether the review
// passes or fails; it exits 1 when the review cannot run or a reporter fails
export async function runReviewCommand(values: ReviewValues, ctx: CLIContext): Promise<number> {
  const repoDir = await readGitText(ctx, ctx.cwd, ['rev-parse', '--show-toplevel']);

  if (values.full && values.pr === undefined) {
    throw new Error('--full takes --pr; a review without --pr covers the whole change');
  }

  if (values.fixesOnly && values.pr === undefined) {
    throw new Error('--fixes-only takes --pr; it confirms the fixes of an earlier review');
  }

  if (values.fixesOnly && values.full) {
    throw new Error(
      '--fixes-only reviews only the commits since the last review; leave out --full',
    );
  }

  const issueText =
    values.issueFile === undefined ? null : await readIssueFile(ctx, values.issueFile);

  const change =
    values.pr === undefined
      ? await resolveLocalChange(ctx, repoDir, values)
      : await resolvePullRequestChange(
          ctx,
          repoDir,
          values,
          issueText === null && !values.fixesOnly,
        );

  // the config comes from the commit the change starts from, so a change that edits the config is
  // reviewed under the config it would replace
  const loaded = await loadRepoConfig(ctx, repoDir, { commit: change.configCommit });

  for (const label of loaded.missingRules) {
    ctx.logger.warn('the repo holds no rules file {label}, so the review reads no rules from it', {
      label,
    });
  }

  const adapterID = values.adapter ?? loaded.config.adapter ?? 'codex';

  const adapter = buildConfiguredAdapter(
    ctx.createAdapter(adapterID),
    loaded.config.adapters[adapterID] ?? {},
  );

  const pastEscapes = await readPastEscapes(getStorePath(loaded.config, ctx), change.repo);

  const reviewsDir = join(ctx.cacheDir, 'reviews');

  await mkdir(reviewsDir, { recursive: true });

  const tempDir = await mkdtemp(join(reviewsDir, 'review-'));

  let result: ReviewResult;

  try {
    if (values.fixesOnly && change.pullRequest !== null) {
      const run = await runFixesOnlyReview({
        runner: ctx.runner,
        repoDir,
        repo: change.repo,
        pullRequest: change.pullRequest,
        base: change.base,
        head: change.head,
        title: change.title,
        configHash: loaded.hash,
        fixes: change.fixes,
        maxFileChars: loaded.config.thresholds.maxFileChars,
        adapter,
        tempDir,
        logger: ctx.logger,
        ...(ctx.now === undefined ? {} : { now: ctx.now }),
      });

      for (const check of run.fixChecks ?? []) {
        ctx.logger.info('the fix of {findingID} holds: {fixed}, {reason}', { ...check });
      }

      result = reviewResultSchema.parse(run);
    } else {
      const run = await runReview({
        runner: ctx.runner,
        mergeModel: loaded.config.adapters[adapterID]?.mergeModel ?? null,
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
        linkedIssue: issueText ?? change.linkedIssue,
        pullRequest: change.pullRequest,
        isIncremental: change.isIncremental,
        ...(change.mergeBase === null ? {} : { mergeBase: change.mergeBase }),
        round: change.round,
        earlierFindings: change.earlierFindings,
        isPush: values.push,
        pastEscapes,
        ...(ctx.now === undefined ? {} : { now: ctx.now }),
      });

      for (const item of run.result.dropped) {
        ctx.logger.info('dropped a {lens} finding, {reason}: {title}', item);
      }

      result = reviewResultSchema.parse(run.result);
    }
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

  // the commit the config reads from: a pull request's base, or a local change's base, which a
  // delta review of a pull request does not share, since its base is a head of the pull request
  configCommit: string;
  title: string;
  body: string;

  // the issue a pull request body closes, for the intent lens; a local change links none
  linkedIssue: string | null;
  pullRequest: PullRequestRef | null;

  // the base is the last reviewed head of a pull request, so the change is only its new commits
  isIncremental: boolean;

  // the merge base of an incremental review, which keeps the new commits to the files the pull
  // request changes, so a merge from the base branch adds none of its own
  mergeBase: string | null;

  // which review of the pull request this is, from 1, and the findings the earlier reviews posted,
  // which the design pass reads; a local change is always a first review
  round: number;
  earlierFindings: EarlierFinding[];

  // the findings whose latest answer is `fixed`, which a fixes-only run checks; read only for one
  fixes: AnsweredFix[];
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

  const repo = await readRepoName(ctx, repoDir);

  return {
    repo,
    base,
    head,
    configCommit: base,
    title,
    body,
    linkedIssue: null,
    pullRequest: null,
    isIncremental: false,
    mergeBase: null,
    round: 1,
    earlierFindings: [],
    fixes: [],
  };
}

// a pull request's change from GitHub: its title and body, its head, and its base; once noslop has
// reviewed an earlier head of it, the base is that head, so a re-review covers only the new commits;
// --full keeps the merge base, so the review covers the whole change again
async function resolvePullRequestChange(
  ctx: CLIContext,
  repoDir: string,
  values: ReviewValues,
  shouldReadLinkedIssue: boolean,
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

  const connection = await ctx.loadGitHubConnection();
  const state = await readPullRequestState(connection, pullRequest);

  // only a review with no failed call covered its head, so only such a head bases a delta
  const summary = state.summary?.marker;
  const full = summary !== undefined && summary.failedCalls === 0 ? summary.head : null;
  const latest = values.fixesOnly ? findCompleteHead(summary) : full;
  const reviewed = values.full ? null : latest;

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

  if (values.fixesOnly && !isDelta) {
    throw new Error(
      '--fixes-only needs new commits after the head of an earlier review with no failed call',
    );
  }

  const linkedIssue = shouldReadLinkedIssue
    ? await readLinkedIssue(connection, pullRequest, state.body)
    : null;

  return {
    repo,
    base: isDelta ? reviewed : start,
    head: state.headSha,
    configCommit: state.baseSha,
    title: state.title,
    body: state.body,
    linkedIssue,
    pullRequest,
    isIncremental: isDelta,
    mergeBase: isDelta ? start : null,
    round: (state.summary?.marker.reviews ?? 0) + 1,
    earlierFindings: state.threads.map((thread): EarlierFinding => ({
      id: thread.marker.id,
      lens: thread.marker.lens,
      severity: thread.marker.severity,
      title: thread.marker.title,
      path: thread.marker.path,
      answer: thread.replies.at(-1)?.body.trim().split('\n')[0] ?? null,
    })),
    fixes: values.fixesOnly ? await readAnsweredFixes(connection, pullRequest, state) : [],
  };
}

// the head of the newest run with no failed call that the summary marker keeps, so a fixes-only run
// whose call failed leaves the next one its own base
function findCompleteHead(summary: SummaryMarker | undefined): string | null {
  if (summary === undefined) {
    return null;
  }

  if (summary.failedCalls === 0) {
    return summary.head;
  }

  return summary.earlier?.find((range) => range.partial !== true)?.head ?? null;
}

// each finding whose latest disposition is `fixed`, as its comment keeps it, with the marker left out
async function readAnsweredFixes(
  connection: GitHubConnection,
  pullRequest: PullRequestRef,
  state: PullRequestState,
): Promise<AnsweredFix[]> {
  const dispositions = await readThreadDispositions(connection.client, pullRequest, state.threads);

  const latest = new Map(dispositions.map((item) => [item.findingID, item]));

  return state.threads.flatMap((thread): AnsweredFix[] => {
    const disposition = latest.get(thread.marker.id);

    if (disposition?.kind !== 'fixed') {
      return [];
    }

    return [
      {
        id: thread.marker.id,
        title: thread.marker.title,
        lens: thread.marker.lens,
        path: thread.marker.path,
        line: thread.line,
        comment: thread.body.replace(/<!-- noslop:[\s\S]*?-->/u, '').trim(),
        commit: disposition.value,
      },
    ];
  });
}

// a relative path resolves against the working directory, as the shell that passed it does
async function readIssueFile(ctx: CLIContext, path: string): Promise<string> {
  const file = Bun.file(resolve(ctx.cwd, path));

  const exists = await file.exists();

  if (!exists) {
    throw new Error(`--issue-file names no file: ${path}`);
  }

  const text = await file.text();

  return text.trim();
}

// the files of the repo where a defect escaped an earlier review, from the store; a user with no
// store yet has none, and the review makes no store to find that out
async function readPastEscapes(path: string, repo: string): Promise<string[]> {
  const exists = await Bun.file(path).exists();

  if (!exists) {
    return [];
  }

  const store = await loadStore(path);

  try {
    return await readEscapePaths(store, repo);
  } finally {
    await store.destroy();
  }
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
