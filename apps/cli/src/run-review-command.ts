import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { LoadedConfig } from '@noslop/config';
import type { DismissedFinding, PullRequestRef, ReviewResult } from '@noslop/contract';
import { reviewResultSchema } from '@noslop/contract';
import type { GitHubConnection, PullRequestState } from '@noslop/github';
import {
  collectDismissedFindings,
  findChangedPaths,
  findLensHead,
  readLinkedIssue,
  readNetChangeKey,
  readThreadDispositions,
} from '@noslop/github';
import type { AnsweredFix } from '@noslop/review';
import { runFixesOnlyReview, runReview } from '@noslop/review';
import { loadStore, readEscapePaths } from '@noslop/sqlite';
import cliPackage from '../package.json' with { type: 'json' };
import { buildConfiguredAdapter } from './build-configured-adapter';
import type { CLIContext } from './cli-context';
import { formatReviewSummary } from './format-review-summary';
import { getStorePath } from './get-store-path';
import { loadRepoConfig } from './load-repo-config';
import { readIssueFile } from './read-issue-file';
import { readRepoName } from './read-repo-name';
import { readTrustedPullRequest } from './read-trusted-pull-request';
import { runReporters } from './run-reporters';

export interface ReviewValues {
  base: string | undefined;
  head: string | undefined;
  pr: string | undefined;
  full: boolean;

  fixesOnly: boolean;
  repo: string | undefined;
  report: string | undefined;
  json: boolean;
  push: boolean;
  adapter: string | undefined;

  issueFile: string | undefined;
}

export async function runReviewCommand(values: ReviewValues, ctx: CLIContext): Promise<number> {
  const repoDir = await readGitText(ctx, ctx.cwd, ['rev-parse', '--show-toplevel']);

  if (values.full && values.pr === undefined) {
    throw new Error('--full takes --pr; a review without --pr covers the whole change');
  }

  if (values.fixesOnly && values.pr === undefined) {
    throw new Error('--fixes-only takes --pr; it confirms the fixes of an earlier review');
  }

  if (values.fixesOnly && values.full) {
    throw new Error('--fixes-only runs only fix calls; leave out --full');
  }

  const issueText =
    values.issueFile === undefined ? null : await readIssueFile(ctx.cwd, values.issueFile);

  const change =
    values.pr === undefined
      ? await resolveLocalChange(ctx, repoDir, values)
      : await resolvePullRequestChange(ctx, repoDir, values, issueText === null);

  const loaded = change.config;

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
    if (values.fixesOnly && change.pullRequest !== null && change.pullRequestBase !== null) {
      const run = await runFixesOnlyReview({
        runner: ctx.runner,
        repoDir,
        repo: change.repo,
        pullRequest: change.pullRequest,
        base: change.base,
        head: change.head,
        mergeBase: change.pullRequestBase,
        title: change.title,
        body: change.body,
        configHash: loaded.hash,
        fixes: change.fixes,
        maxFileChars: loaded.config.thresholds.maxFileChars,
        maxCallChars: loaded.config.thresholds.maxCallChars,
        adapter,
        tempDir,
        logger: ctx.logger,
        resolution: { config: loaded.config, dismissedFindings: change.dismissedFindings },
        staticCheck: {
          config: loaded.config,
          linkedIssue: issueText ?? change.linkedIssue,
          cacheDir: join(ctx.cacheDir, 'index'),
          ...(change.author === undefined ? {} : { author: change.author }),
        },
        ...(ctx.now === undefined ? {} : { now: ctx.now }),
      });

      for (const check of run.fixChecks ?? []) {
        ctx.logger.info('the fix of {findingID} holds: {fixed}, {reason}', { ...check });
      }

      for (const check of run.resolutionChecks ?? []) {
        ctx.logger.info('the resolution of merge {merge} is sound: {sound}, {reason}', {
          ...check,
        });
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
        isIncremental: change.paths !== null,
        ...(change.paths === null || change.pullRequestBase === null
          ? {}
          : { paths: change.paths, mergeBase: change.pullRequestBase }),
        isFirstPullRequestReview: change.isFirstPullRequestReview,
        dismissedFindings: change.dismissedFindings,
        isPush: values.push,
        pastEscapes,
        ...(change.author === undefined ? {} : { author: change.author }),
        ...(change.pullRequestBase === null
          ? {}
          : { fixes: { answers: change.fixes, pullRequestBase: change.pullRequestBase } }),
        ...(ctx.now === undefined ? {} : { now: ctx.now }),
      });

      for (const item of run.result.dropped) {
        ctx.logger.info('dropped a {lens} finding, {reason}: {title}', item);
      }

      for (const check of run.result.fixChecks ?? []) {
        ctx.logger.info('the fix of {findingID} holds: {fixed}, {reason}', { ...check });
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

async function readGitText(ctx: CLIContext, cwd: string, args: readonly string[]): Promise<string> {
  const result = await ctx.runner.run(['git', ...args], { cwd });

  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}

interface ResolvedChange {
  repo: string;
  base: string;
  head: string;

  config: LoadedConfig;
  title: string;
  body: string;
  author?: string;

  linkedIssue: string | null;
  pullRequest: PullRequestRef | null;
  paths: string[] | null;

  pullRequestBase: string | null;

  isFirstPullRequestReview: boolean;

  dismissedFindings: DismissedFinding[];

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
    config: await loadRepoConfig(ctx, repoDir, { commit: base }),
    title,
    body,
    linkedIssue: null,
    pullRequest: null,
    paths: null,
    pullRequestBase: null,
    isFirstPullRequestReview: false,
    dismissedFindings: [],
    fixes: [],
  };
}

async function resolveDefaultBase(ctx: CLIContext, repoDir: string, head: string): Promise<string> {
  for (const branch of ['origin/HEAD', 'main', 'master']) {
    const result = await ctx.runner.run(['git', 'merge-base', head, branch], { cwd: repoDir });

    if (result.exitCode === 0) {
      return result.stdout.trim();
    }
  }

  throw new Error('noslop cannot find the branch the change starts from; pass --base');
}

async function resolvePullRequestChange(
  ctx: CLIContext,
  repoDir: string,
  values: ReviewValues,
  canReadLinkedIssue: boolean,
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

  const trusted = await readTrustedPullRequest(ctx, repoDir, pullRequest);

  const config = trusted.config;
  const connection = trusted.connection;
  const state = trusted.state;
  const summary = state.summary?.marker ?? null;
  const full = summary !== null && summary.failedCalls === 0 ? summary.head : null;
  const reviewed = values.fixesOnly ? (full ?? findLensHead(summary)) : null;

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

  const isHeld = reviewed !== null && ancestry.exitCode === 0;

  const paths =
    values.full || values.fixesOnly ? null : await readChangedPaths(connection, pullRequest, state);

  const fixes = await readAnsweredFixes(connection, pullRequest, state);

  const postedHeads = new Set(
    fixes.flatMap((fix) => (fix.postedHead === null ? [] : [fix.postedHead])),
  );

  // One fetch per head, since git fails a whole fetch when it cannot get any one sha it names.
  for (const postedHead of postedHeads) {
    await ctx.runner.run(['git', 'fetch', '--quiet', 'origin', postedHead], { cwd: repoDir });
  }

  const linkedIssue =
    canReadLinkedIssue && (!values.fixesOnly || fixes.some((fix) => fix.lens === 'static'))
      ? await readLinkedIssue(connection, pullRequest, state.body)
      : null;

  return {
    repo,

    base: isHeld && reviewed !== null ? reviewed : start,
    head: state.headSha,
    config,
    title: state.title,
    body: state.body,
    author: state.author,
    linkedIssue,
    pullRequest,
    paths,
    pullRequestBase: start,
    isFirstPullRequestReview: summary?.lensKey === undefined && findLensHead(summary) === null,
    dismissedFindings: collectDismissedFindings(state.threads),
    fixes,
  };
}

async function readChangedPaths(
  connection: GitHubConnection,
  pullRequest: PullRequestRef,
  state: PullRequestState,
): Promise<string[] | null> {
  const summary = state.summary?.marker ?? null;
  const lensHead = findLensHead(summary);

  if (summary === null || summary.failedCalls > 0 || lensHead === null) {
    return null;
  }

  const lensKey = summary.lensKey ?? (lensHead === summary.head ? summary.key : undefined);

  const currentKey = await readNetChangeKey(connection.client, pullRequest, state.headSha);

  return findChangedPaths({ head: lensHead, key: lensKey }, state.headSha, currentKey);
}

async function readAnsweredFixes(
  connection: GitHubConnection,
  pullRequest: PullRequestRef,
  state: PullRequestState,
): Promise<AnsweredFix[]> {
  const dispositions = await readThreadDispositions(connection.client, pullRequest, state.threads);

  const latest = new Map(dispositions.map((item) => [item.findingID, item]));
  const confirmed = new Set(state.summary?.marker.confirmed);

  return state.threads.flatMap((thread): AnsweredFix[] => {
    const disposition = latest.get(thread.marker.id);

    if (disposition?.kind !== 'fixed') {
      return [];
    }

    if (confirmed.has(`${thread.marker.id}:${disposition.value}`)) {
      return [];
    }

    return [
      {
        id: thread.marker.id,
        title: thread.marker.title,
        lens: thread.marker.lens,
        path: thread.marker.path,
        line: thread.line,
        comment: thread.body.replaceAll(/<!-- noslop:[\s\S]*?-->/gu, '').trim(),
        postedHead: thread.marker.head ?? null,
        commit: disposition.value === '' ? null : disposition.value,
      },
    ];
  });
}

async function readPastEscapes(path: string, repo: string): Promise<string[]> {
  // Opening a SQLite store creates its file, so a user with no store yet gets none made by a review.
  const exists = await Bun.file(path).exists();

  if (!exists) {
    return [];
  }

  const store = await loadStore(path, { version: cliPackage.version });

  try {
    return await readEscapePaths(store, repo);
  } finally {
    await store.destroy();
  }
}
