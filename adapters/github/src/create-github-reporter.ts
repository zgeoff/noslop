import type {
  Finding,
  PullRequestRef,
  Reporter,
  ReporterContext,
  ReviewResult,
} from '@noslop/contract';
import { match } from 'ts-pattern';
import type { FindingPost } from './build-finding-posts';
import { buildFindingPosts } from './build-finding-posts';
import { buildFixConfirmations } from './build-fix-confirmations';
import { buildMergeLists } from './build-merge-lists';
import { buildReviewedChange } from './build-reviewed-change';
import type { GitHubClient, GitHubConnection } from './create-github-connection';
import { findLensHead } from './find-lens-head';
import { followUpMarkerSchema } from './follow-up-marker';
import { formatFindingComment } from './format-finding-comment';
import { formatFixedFindingComment } from './format-fixed-finding-comment';
import { formatMarker } from './format-marker';
import { formatRewrittenComment } from './format-rewritten-comment';
import type { FixConfirmation } from './format-summary-comment';
import { formatSummaryComment } from './format-summary-comment';
import type { NetChangeKey } from './net-change-key';
import { parseMarker } from './parse-marker';
import { planReviewPost } from './plan-review-post';
import { readAllPages } from './read-all-pages';
import { readNetChangeKey } from './read-net-change-key';
import type { FindingThread, PullRequestState } from './read-pull-request-state';
import { readPullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';
import { runGitHubCheck } from './run-github-check';
import type { SummaryMarker } from './summary-marker';
import { withWriteRetry } from './with-write-retry';

export interface GitHubReporterOptions {
  loadConnection: () => Promise<GitHubConnection>;

  recordCommentURLs?: (pr: PullRequestRef, links: ReadonlyMap<string, string>) => Promise<void>;
}

export function createGitHubReporter(options: GitHubReporterOptions): Reporter {
  return {
    id: 'github',
    runsLast: true,
    report: async (result, ctx) => {
      const pr = result.pullRequest;

      if (pr === null) {
        throw new Error(
          'the github reporter needs a pull request: run noslop review --pr <number>',
        );
      }

      await withPullRequestLock(`${pr.owner}/${pr.repo}#${pr.number}`, () =>
        runReviewPost(options, pr, result, ctx),
      );
    },
  };
}

const postChains = new Map<string, Promise<void>>();

async function withPullRequestLock(key: string, post: () => Promise<void>): Promise<void> {
  const previous = postChains.get(key) ?? Promise.resolve();
  const current = runAfter(previous, post);
  const tail = waitForEnd(current);

  postChains.set(key, tail);

  try {
    await current;
  } finally {
    if (postChains.get(key) === tail) {
      postChains.delete(key);
    }
  }
}

async function runAfter(previous: Promise<void>, post: () => Promise<void>): Promise<void> {
  await previous;
  await post();
}

async function waitForEnd(post: Promise<void>): Promise<void> {
  await Promise.allSettled([post]);
}

async function runReviewPost(
  options: GitHubReporterOptions,
  pr: PullRequestRef,
  result: ReviewResult,
  ctx: ReporterContext,
): Promise<void> {
  const connection = await options.loadConnection();

  if (connection.auth !== 'app') {
    throw new Error(
      'the github reporter posts as the App: set NOSLOP_GITHUB_APP_ID, NOSLOP_GITHUB_APP_PRIVATE_KEY and NOSLOP_GITHUB_APP_INSTALLATION_ID',
    );
  }

  const client = connection.client;

  const before = await readPullRequestState(connection, pr);

  const filed = before.summary?.marker.followUps ?? [];

  const posted = new Set([...before.threads.map((thread) => thread.marker.id), ...filed]);

  const plan = planReviewPost({ summary: before.summary?.marker ?? null, posted }, result);
  const reported = collectReported(result);

  if (!plan.writesSummary) {
    await runCheck(connection, pr, result.head, ctx);

    return;
  }

  const followUps = plan.followUps;
  const rewritten = plan.inline.filter((finding) => finding.anchorCommit !== undefined);
  const inline = plan.inline.filter((finding) => finding.anchorCommit === undefined);
  const write = makePacedWrite(connection);

  const unanchored = await createReviewComments(
    connection,
    write,
    { pr, head: result.head },
    buildFindingPosts(inline, result.head),
  );

  for (const post of unanchored) {
    await write(() =>
      withWriteRetry('unanchored finding comment', 'once', connection.sleep, () =>
        createIssueComment(client, pr, formatUnanchoredComment(post, result.head)),
      ),
    );
  }

  for (const finding of rewritten) {
    await write(() =>
      withWriteRetry('rewritten finding comment', 'once', connection.sleep, () =>
        createIssueComment(client, pr, formatRewrittenComment(finding, result.head)),
      ),
    );
  }

  const unfiled =
    followUps.length === 0 ? [] : await loadUnfiledFollowUps(connection, pr, followUps);

  for (const finding of unfiled) {
    await write(() => createFollowUpIssue(connection, pr, finding));
  }

  const confirmations = buildFixConfirmations({
    findings: before.threads.map((thread) => thread.marker),
    dispositions: await readThreadDispositions(client, pr, before.threads),
    confirmed: before.summary?.marker.confirmed ?? [],
    reported,
    result,
  });

  for (const item of confirmations) {
    if (item.failure !== undefined) {
      ctx.logger.warn('no fix confirmed for {id} in {commit}: {failure}', {
        id: item.id,
        commit: item.commit.slice(0, 12),
        failure: item.failure,
      });
    }
  }

  await updateFixedComments(connection, pr, before.threads, confirmations);

  const after = await readPullRequestState(connection, pr);

  const links = new Map(
    after.threads.map((thread) => [thread.marker.id, toCommentURL(pr, thread)]),
  );

  const merges = buildMergeLists(before.summary?.marker ?? null, result);

  const reviewed = await readSummaryChange(client, pr, result, before.summary?.marker ?? null);

  const unjudged = confirmations.flatMap((item) =>
    item.status === 'unjudged' && item.failure !== undefined
      ? [{ id: item.id, commit: item.commit, reason: item.failure }]
      : [],
  );

  const marker = {
    head: reviewed.head,
    ...buildRunFields(result, before.summary?.marker ?? null, reviewed.key),
    ...merges,
    reviews: plan.reviews,
    reviewIDs: plan.reviewIDs,
    reported,
    failedCalls: reviewed.failedCalls,
    followUps: [...filed, ...followUps.map((finding) => finding.id)],
    confirmed: confirmations
      .filter((item) => item.status === 'fixed')
      .map((item) => `${item.id}:${item.commit}`),
    ...(unjudged.length === 0 ? {} : { unjudged }),
    startedAt: result.startedAt,
    ...(reviewed.key === undefined ? {} : { key: reviewed.key }),
  };

  await writeSummaryComment(
    connection,
    pr,
    before,
    formatSummaryComment(result, marker, { confirmations, posted: before.threads.length }, links),
  );

  await runCheck(connection, pr, result.head, ctx);

  await options.recordCommentURLs?.(pr, links);
}

function collectReported(result: ReviewResult): string[] {
  const rejected = (result.fixChecks ?? []).filter((check) => !check.fixed);

  const answered = result.dropped.flatMap((item) =>
    item.answeredID === undefined ? [] : [item.answeredID],
  );

  return [
    ...new Set([
      ...result.findings.map((finding) => finding.id),
      ...rejected.map((check) => check.findingID),
      ...answered,
    ]),
  ];
}

async function runCheck(
  connection: GitHubConnection,
  pr: PullRequestRef,
  head: string,
  ctx: ReporterContext,
): Promise<void> {
  const outcome = await runGitHubCheck(connection, pr, { failedReporters: ctx.failedReporters });

  ctx.logger.info('the noslop check on {head}: {conclusion}', {
    head: head.slice(0, 12),
    conclusion: outcome.conclusion,
  });
}

type PacedWrite = (send: () => Promise<void>) => Promise<void>;

// GitHub asks for a second between the writes that create content, and refuses a burst of them
// with a secondary limit
const WRITE_GAP_MS = 1000;

function makePacedWrite(connection: GitHubConnection): PacedWrite {
  let hasWritten = false;

  return async (send) => {
    if (hasWritten) {
      await connection.sleep(WRITE_GAP_MS);
    }

    hasWritten = true;

    await send();
  };
}

interface ReviewTarget {
  pr: PullRequestRef;
  head: string;
}

// GitHub refuses the whole review when one comment's line is outside the diff, so on that refusal
// each comment is posted alone.
async function createReviewComments(
  connection: GitHubConnection,
  write: PacedWrite,
  target: ReviewTarget,
  posts: readonly FindingPost[],
): Promise<FindingPost[]> {
  const pr = target.pr;
  const head = target.head;

  if (posts.length === 0) {
    return [];
  }

  try {
    await write(() =>
      withWriteRetry('review', 'once', connection.sleep, () =>
        connection.client.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
          owner: pr.owner,
          repo: pr.repo,
          pull_number: pr.number,
          commit_id: head,
          event: 'COMMENT',
          comments: posts.map((post) => toReviewComment(post, head)),
        }),
      ),
    );

    return [];
  } catch (error) {
    if (!isUnprocessable(error)) {
      throw error;
    }
  }

  const refused: FindingPost[] = [];

  for (const post of posts) {
    try {
      await write(() =>
        withWriteRetry('finding comment', 'once', connection.sleep, () =>
          connection.client.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
            owner: pr.owner,
            repo: pr.repo,
            pull_number: pr.number,
            commit_id: head,
            ...toReviewComment(post, head),
          }),
        ),
      );
    } catch (error) {
      if (!isUnprocessable(error)) {
        throw error;
      }

      refused.push(post);
    }
  }

  return refused;
}

function toReviewComment(post: FindingPost, head: string) {
  const anchor = post.lead.anchor;
  const range = anchor.startLine < anchor.endLine;

  return {
    path: anchor.path,
    line: anchor.endLine,
    side: 'RIGHT' as const,
    body: formatFindingComment(post.lead, head, post.folded),
    ...(range ? { start_line: anchor.startLine, start_side: 'RIGHT' as const } : {}),
  };
}

function isUnprocessable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 422;
}

async function createIssueComment(
  client: GitHubClient,
  pr: PullRequestRef,
  body: string,
): Promise<void> {
  await client.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
    owner: pr.owner,
    repo: pr.repo,
    issue_number: pr.number,
    body,
  });
}

function formatUnanchoredComment(post: FindingPost, head: string): string {
  const finding = post.lead;
  const anchor = `\`${finding.anchor.path}:${finding.anchor.startLine}-${finding.anchor.endLine}\``;

  return [
    `GitHub cannot anchor this finding at ${anchor}, outside the diff. Answer it in a comment that starts with its id, \`${finding.id}\`.`,
    '',
    formatFindingComment(finding, head, post.folded),
  ].join('\n');
}

async function loadUnfiledFollowUps(
  connection: GitHubConnection,
  pr: PullRequestRef,
  followUps: readonly Finding[],
): Promise<Finding[]> {
  const issues = await readAllPages(async (page, perPage) => {
    const response = await connection.client.request('GET /repos/{owner}/{repo}/issues', {
      owner: pr.owner,
      repo: pr.repo,
      state: 'all',
      page,
      per_page: perPage,
    });

    return response.data;
  });

  const filed = new Set(
    issues.flatMap((issue) => {
      const isOwn = connection.appLogin !== null && issue.user?.login === connection.appLogin;

      const marker = isOwn
        ? parseMarker('follow-up', followUpMarkerSchema, issue.body ?? '')
        : null;

      return marker?.pullRequest === pr.number ? [marker.id] : [];
    }),
  );

  return followUps.filter((finding) => !filed.has(finding.id));
}

async function createFollowUpIssue(
  connection: GitHubConnection,
  pr: PullRequestRef,
  finding: Finding,
): Promise<void> {
  await withWriteRetry('follow-up issue', 'once', connection.sleep, () =>
    connection.client.request('POST /repos/{owner}/{repo}/issues', {
      owner: pr.owner,
      repo: pr.repo,
      title: finding.title,
      body: [
        `noslop found this in #${pr.number} after its one re-check, in code the pull request did not write.`,
        '',
        `At \`${finding.anchor.path}:${finding.anchor.startLine}-${finding.anchor.endLine}\`, ${finding.severity} ${finding.verdict}.`,
        '',
        finding.body,
        '',
        formatMarker('follow-up', { id: finding.id, pullRequest: pr.number }),
      ].join('\n'),
    }),
  );
}

async function updateFixedComments(
  connection: GitHubConnection,
  pr: PullRequestRef,
  threads: readonly FindingThread[],
  confirmations: readonly FixConfirmation[],
): Promise<void> {
  const findFix = (thread: FindingThread) =>
    confirmations.find((item) => item.id === thread.marker.id && item.status === 'fixed');

  for (const thread of threads) {
    const shared = threads.filter(
      (other) => other.source === thread.source && other.commentID === thread.commentID,
    );

    if (shared[0] !== thread) {
      continue;
    }

    const isFixed = shared.every((other) => findFix(other) !== undefined);
    const commit = isFixed ? (findFix(thread)?.commit ?? null) : null;
    const body = formatFixedFindingComment(thread.body, thread.marker, commit);

    if (body === thread.body) {
      continue;
    }

    const params = { owner: pr.owner, repo: pr.repo, comment_id: thread.commentID, body };

    await withWriteRetry('edit of a finding comment', 'repeatable', connection.sleep, () =>
      thread.source === 'review'
        ? connection.client.request(
            'PATCH /repos/{owner}/{repo}/pulls/comments/{comment_id}',
            params,
          )
        : connection.client.request(
            'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}',
            params,
          ),
    );
  }
}

function toCommentURL(pr: PullRequestRef, thread: FindingThread): string {
  const anchor =
    thread.source === 'review'
      ? `discussion_r${thread.commentID}`
      : `issuecomment-${thread.commentID}`;

  return `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}#${anchor}`;
}

interface SummaryChange {
  head: string;
  key?: NetChangeKey;
  failedCalls: number;
}

function readSummaryChange(
  client: GitHubClient,
  pr: PullRequestRef,
  result: ReviewResult,
  previous: SummaryMarker | null,
): Promise<SummaryChange> {
  return match(buildReviewedChange(result, previous))
    .with({ kind: 'own' }, async (own) => ({
      head: result.head,
      key: await readNetChangeKey(client, pr, result.head),
      failedCalls: own.failedCalls,
    }))
    .with({ kind: 'kept' }, (kept) => Promise.resolve(toSummaryChange(kept)))
    .exhaustive();
}

function toSummaryChange(kept: SummaryChange): SummaryChange {
  return kept.key === undefined
    ? { head: kept.head, failedCalls: kept.failedCalls }
    : { head: kept.head, key: kept.key, failedCalls: kept.failedCalls };
}

interface RunFields {
  checked?: string[];
  lensHead?: string;
  lensKey?: NetChangeKey;
}

function buildRunFields(
  result: ReviewResult,
  previous: SummaryMarker | null,
  key: NetChangeKey | undefined,
): RunFields {
  const lensHead = findLensHead(previous);

  const lensKey =
    previous?.lensKey ??
    (lensHead !== null && lensHead === previous?.head ? previous.key : undefined);

  const carried = lensKey === undefined ? {} : { lensKey };

  if (result.fixesOnly !== true) {
    return result.failedCalls.length === 0
      ? { lensHead: result.head, ...(key === undefined ? {} : { lensKey: key }) }
      : carried;
  }

  const fixed = (result.fixChecks ?? []).filter((check) => check.fixed);

  return {
    checked: fixed.map((check) => check.findingID),
    ...(lensHead === null ? {} : { lensHead }),
    ...carried,
  };
}

// a summary that GitHub kept before it answered 500 leaves a second one on a retry, and a later read
// takes the latest summary
async function writeSummaryComment(
  connection: GitHubConnection,
  pr: PullRequestRef,
  before: PullRequestState,
  body: string,
): Promise<void> {
  const summary = before.summary;

  await withWriteRetry('summary comment', 'repeatable', connection.sleep, () =>
    summary === null
      ? createIssueComment(connection.client, pr, body)
      : connection.client.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}', {
          owner: pr.owner,
          repo: pr.repo,
          comment_id: summary.commentID,
          body,
        }),
  );
}
