import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { LoadedConfig } from '@noslop/config';
import type {
  DismissedFinding,
  EarlierFinding,
  PullRequestRef,
  ReviewResult,
} from '@noslop/contract';
import { reviewResultSchema } from '@noslop/contract';
import type { GitHubConnection, PullRequestState, SummaryMarker } from '@noslop/github';
import {
  collectDismissedFindings,
  readFixCommits,
  readLinkedIssue,
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
import { readFixFloors } from './read-fix-floors';
import { readRebasedHead } from './read-rebased-head';
import { readTrustedPullRequest } from './read-trusted-pull-request';
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
        configHash: loaded.hash,
        fixes: change.fixes,
        lensHead: change.lensHead,
        ...(change.rebasedFrom === null ? {} : { rebasedFrom: change.rebasedFrom }),
        maxFileChars: loaded.config.thresholds.maxFileChars,
        adapter,
        tempDir,
        logger: ctx.logger,
        resolution: { config: loaded.config, dismissedFindings: change.dismissedFindings },
        staticCheck: {
          config: loaded.config,
          body: change.body,
          linkedIssue: issueText ?? change.linkedIssue,
          cacheDir: join(ctx.cacheDir, 'index'),
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
        isIncremental: change.isIncremental,
        ...(change.mergeBase === null ? {} : { mergeBase: change.mergeBase }),
        round: change.round,
        earlierFindings: change.earlierFindings,
        dismissedFindings: change.dismissedFindings,
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

async function readGitText(ctx: CLIContext, cwd: string, args: readonly string[]): Promise<string> {
  const result = await ctx.runner.run(['git', ...args], { cwd });

  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
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

interface ResolvedChange {
  repo: string;
  base: string;
  head: string;

  // the config at a pull request's base or a local change's base, so a change that edits the config
  // is reviewed under the config it would replace; a delta review's base is a head of the pull request
  config: LoadedConfig;
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

  // the merge base of a pull request with its base branch, where its whole diff starts, which a fix
  // commit must reach; null for a local change
  pullRequestBase: string | null;

  // which review of the pull request this is, from 1, and the findings the earlier reviews posted,
  // which the design pass reads; a local change is always a first review
  round: number;
  earlierFindings: EarlierFinding[];

  // the posted findings whose latest answer is `not-a-defect`, which the review drops when a new
  // finding matches one
  dismissedFindings: DismissedFinding[];

  // the findings whose latest answer is `fixed`, which a fixes-only run checks; read only for one
  fixes: AnsweredFix[];

  // the head of the newest lens review of a pull request, which a fixes-only run reads past
  lensHead: string | null;

  // the reviewed head that a rebase took off the branch, when the base is the branch commit with its
  // patches
  rebasedFrom: string | null;
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
    config: await loadRepoConfig(ctx, repoDir, { commit: base }),
    title,
    body,
    linkedIssue: null,
    pullRequest: null,
    isIncremental: false,
    mergeBase: null,
    pullRequestBase: null,
    round: 1,
    earlierFindings: [],
    dismissedFindings: [],
    fixes: [],
    lensHead: null,
    rebasedFrom: null,
  };
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

// a pull request's change from GitHub: its title and body, its head, and its base; once noslop has
// reviewed an earlier head of it, the base is that head, so a re-review covers only the new commits;
// --full keeps the merge base, so the review covers the whole change again
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

  // only a review with no failed call covered its head, so only such a head bases a delta
  const summary = state.summary?.marker;
  const full = summary !== undefined && summary.failedCalls === 0 ? summary.head : null;
  const latest = values.fixesOnly ? findCompleteHead(summary) : full;
  const reviewed = values.full ? null : latest;

  // a lens review of a head that a lens review with no failed call already covered would review the
  // whole change again and raise its findings anew, so it runs only under --full
  if (!values.full && !values.fixesOnly && findLensHead(summary) === state.headSha) {
    throw new Error(
      `a review with no failed call already covered ${state.headSha.slice(0, 12)}, the head of the pull request; push a commit to review it, or pass --full to review the whole change again`,
    );
  }

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

  const refusal =
    '--fixes-only needs an earlier review with no failed call whose head the branch still holds';

  // a fixes-only run may run again at the same head, for a `fixed` reply posted after the last run
  if (values.fixesOnly && reviewed === null) {
    throw new Error(refusal);
  }

  // a rebase after the review leaves its head off the branch, so the run starts from the branch
  // commit with the same patches, and each fix diff still covers only the commits after the review
  const rebased =
    values.fixesOnly && reviewed !== null && ancestry.exitCode !== 0
      ? await readRebasedHead(ctx.runner, {
          repoDir,
          reviewed,
          base: state.baseSha,
          head: state.headSha,
        })
      : { head: reviewed, failure: null };

  if (values.fixesOnly && rebased.head === null) {
    throw new Error(`${refusal}: ${rebased.failure ?? ''}`);
  }

  // the heads a late fix must come after, each as it stands on the branch after a rebase
  const floors = values.fixesOnly
    ? await readFixFloors(ctx.runner, {
        repoDir,
        base: state.baseSha,
        head: state.headSha,
        lensHead: findLensHead(summary),
        fixes: await readAnsweredFixes(connection, pullRequest, state),
      })
    : { lensHead: findLensHead(summary), fixes: [] };

  const lensHead = floors.lensHead;
  const fixes = floors.fixes;

  // a fixes-only run reads the linked issue only to run the static stage again for a static fix,
  // since a static check compares the change against the issue
  const linkedIssue =
    canReadLinkedIssue && (!values.fixesOnly || fixes.some((fix) => fix.lens === 'static'))
      ? await readLinkedIssue(connection, pullRequest, state.body)
      : null;

  return {
    repo,
    base: (values.fixesOnly || isDelta) && rebased.head !== null ? rebased.head : start,
    head: state.headSha,
    lensHead,
    rebasedFrom: rebased.head === reviewed ? null : reviewed,
    config,
    title: state.title,
    body: state.body,
    linkedIssue,
    pullRequest,
    isIncremental: isDelta,
    mergeBase: isDelta ? start : null,
    pullRequestBase: start,
    round: (state.summary?.marker.reviews ?? 0) + 1,
    earlierFindings: state.threads.map((thread): EarlierFinding => ({
      id: thread.marker.id,
      lens: thread.marker.lens,
      severity: thread.marker.severity,
      title: thread.marker.title,
      path: thread.marker.path,
      answer: thread.replies.at(-1)?.body.trim().split('\n')[0] ?? null,
    })),
    dismissedFindings: collectDismissedFindings(state.threads),
    fixes,
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

// the head of the newest review with no failed call that ran its lenses, which judged every `fixed`
// reply before it; a fixes-only run's range keeps the list of fixes it checked, and a lens review's
// keeps none
function findLensHead(summary: SummaryMarker | undefined): string | null {
  if (summary === undefined) {
    return null;
  }

  if (summary.checked === undefined && summary.failedCalls === 0) {
    return summary.head;
  }

  const range = summary.earlier?.find(
    (item) => item.checked === undefined && item.partial !== true,
  );

  return range?.head ?? null;
}

// each finding whose latest disposition is `fixed` with a fix the summary does not hold confirmed, as
// its comment keeps it, with the marker left out
async function readAnsweredFixes(
  connection: GitHubConnection,
  pullRequest: PullRequestRef,
  state: PullRequestState,
): Promise<AnsweredFix[]> {
  const dispositions = await readThreadDispositions(connection.client, pullRequest, state.threads);

  const latest = new Map(dispositions.map((item) => [item.findingID, item]));
  const confirmed = new Set(state.summary?.marker.confirmed);

  // a rebase rewrites a fix commit an answer named, and the check counts the branch commit with its
  // change in its place, so the run judges that commit
  const fixCommits = await readFixCommits(connection.client, pullRequest, {
    commits: state.commits,
    dispositions,
    head: state.headSha,
    threads: state.threads,
  });

  return state.threads.flatMap((thread): AnsweredFix[] => {
    const disposition = latest.get(thread.marker.id);

    if (disposition?.kind !== 'fixed') {
      return [];
    }

    // a review already judged this fix, and asking again could only revoke it
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
        comment: thread.body.replace(/<!-- noslop:[\s\S]*?-->/u, '').trim(),
        commit:
          fixCommits.rewritten.get(`${thread.marker.id}:${disposition.value}`)?.commit ??
          disposition.value,
        postedHead: thread.marker.head ?? null,
      },
    ];
  });
}

// the files of the repo where a defect escaped an earlier review, from the store; a user with no
// store yet has none, and the review makes no store to find that out
async function readPastEscapes(path: string, repo: string): Promise<string[]> {
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
