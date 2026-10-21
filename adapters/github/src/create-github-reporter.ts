import type {
  Finding,
  PullRequestRef,
  Reporter,
  ReporterContext,
  ReviewResult,
} from '@noslop/contract';
import { buildFixConfirmations } from './build-fix-confirmations';
import { buildMergeLists } from './build-merge-lists';
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

export interface GitHubReporterOptions {
  loadConnection: () => Promise<GitHubConnection>;

  // keeps the link to each finding's comment, by finding ID, once the post and its check are done
  recordCommentURLs?: (pr: PullRequestRef, links: ReadonlyMap<string, string>) => Promise<void>;
}

// posts one pull request review with an inline comment per new finding, the summary, then the check
// run; a finding outside the diff goes to an issue comment, and after the one re-check a non-security
// finding in code the change did not write goes to a follow-up issue
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

// the posts in flight in this process, by pull request, each one the tail of that pull request's chain
const postChains = new Map<string, Promise<void>>();

// runs one post of a pull request at a time in this process, in the order they came, so 2 posts of
// one review cannot both find no follow-up issue and both file one; a failed post leaves the next one
// to run
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

// the next post of the pull request runs once this one ends, failed or not; only the caller of a
// failed post sees its failure
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

  // a post under a token writes markers under the token's login, and no later review trusts them
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

  // a retry of an earlier review leaves the later summary in place and only sets the check again
  // from the current answers
  if (!plan.writesSummary) {
    await runCheck(connection, pr, result.head, ctx);

    return;
  }

  const followUps = plan.followUps;
  const rewritten = plan.inline.filter((finding) => finding.anchorCommit !== undefined);
  const inline = plan.inline.filter((finding) => finding.anchorCommit === undefined);

  const unanchored = await createReviewComments(client, pr, result.head, inline);

  for (const finding of unanchored) {
    await createIssueComment(client, pr, formatUnanchoredComment(finding, result.head));
  }

  for (const finding of rewritten) {
    await createIssueComment(client, pr, formatRewrittenComment(finding, result.head));
  }

  const unfiled =
    followUps.length === 0 ? [] : await loadUnfiledFollowUps(connection, pr, followUps);

  for (const finding of unfiled) {
    await createFollowUpIssue(client, pr, finding);
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

  await updateFixedComments(client, pr, before.threads, confirmations);

  const after = await readPullRequestState(connection, pr);

  const links = new Map(
    after.threads.map((thread) => [thread.marker.id, toCommentURL(pr, thread)]),
  );

  const merges = buildMergeLists(before.summary?.marker ?? null, result);

  const reviewed = await readReviewedChange(client, pr, result, before.summary?.marker ?? null);

  const marker = {
    head: reviewed.head,
    ...buildRunFields(result, before.summary?.marker ?? null),
    ...merges,
    reviews: plan.reviews,
    reviewIDs: plan.reviewIDs,
    reported,
    failedCalls: reviewed.failedCalls,
    followUps: [...filed, ...followUps.map((finding) => finding.id)],
    confirmed: confirmations
      .filter((item) => item.status === 'fixed')
      .map((item) => `${item.id}:${item.commit}`),
    startedAt: result.startedAt,
    ...(reviewed.key === undefined ? {} : { key: reviewed.key }),
  };

  await writeSummaryComment(
    client,
    pr,
    before,
    formatSummaryComment(result, marker, { confirmations, posted: before.threads.length }, links),
  );

  await runCheck(connection, pr, result.head, ctx);

  await options.recordCommentURLs?.(pr, links);
}

// the findings the review counts as reported: a fix it judged not fixed counts as reported again, and
// a finding it dropped as answered `not-a-defect` counts as reported, so it confirms no fix of it
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

// one review holds every inline comment; when GitHub refuses a line outside the diff, each comment is
// posted alone, and the ones it still refuses come back
async function createReviewComments(
  client: GitHubClient,
  pr: PullRequestRef,
  head: string,
  findings: readonly Finding[],
): Promise<Finding[]> {
  if (findings.length === 0) {
    return [];
  }

  try {
    await client.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
      owner: pr.owner,
      repo: pr.repo,
      pull_number: pr.number,
      commit_id: head,
      event: 'COMMENT',
      comments: findings.map((finding) => toReviewComment(finding, head)),
    });

    return [];
  } catch (error) {
    if (!isUnprocessable(error)) {
      throw error;
    }
  }

  const refused: Finding[] = [];

  for (const finding of findings) {
    try {
      await client.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
        owner: pr.owner,
        repo: pr.repo,
        pull_number: pr.number,
        commit_id: head,
        ...toReviewComment(finding, head),
      });
    } catch (error) {
      if (!isUnprocessable(error)) {
        throw error;
      }

      refused.push(finding);
    }
  }

  return refused;
}

function toReviewComment(finding: Finding, head: string) {
  const range = finding.anchor.startLine < finding.anchor.endLine;

  return {
    path: finding.anchor.path,
    line: finding.anchor.endLine,
    side: 'RIGHT' as const,
    body: formatFindingComment(finding, head),
    ...(range ? { start_line: finding.anchor.startLine, start_side: 'RIGHT' as const } : {}),
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

function formatUnanchoredComment(finding: Finding, head: string): string {
  const anchor = `\`${finding.anchor.path}:${finding.anchor.startLine}-${finding.anchor.endLine}\``;

  return [
    `GitHub cannot anchor this finding at ${anchor}, outside the diff. Answer it in a comment that starts with its id, \`${finding.id}\`.`,
    '',
    formatFindingComment(finding, head),
  ].join('\n');
}

// the follow-ups that no issue of the App files yet: a retry after a post that failed past its issues,
// such as on the summary write, finds each issue the first attempt opened by its marker
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
  client: GitHubClient,
  pr: PullRequestRef,
  finding: Finding,
): Promise<void> {
  await client.request('POST /repos/{owner}/{repo}/issues', {
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
  });
}

// strikes the heading of each finding comment whose fix the review confirms, and restores a struck
// comment whose fix no longer holds, around the same marker
async function updateFixedComments(
  client: GitHubClient,
  pr: PullRequestRef,
  threads: readonly FindingThread[],
  confirmations: readonly FixConfirmation[],
): Promise<void> {
  for (const thread of threads) {
    const confirmation = confirmations.find(
      (item) => item.id === thread.marker.id && item.status === 'fixed',
    );

    const commit = confirmation?.commit ?? null;
    const body = formatFixedFindingComment(thread.body, thread.marker, commit);

    if (body === thread.body) {
      continue;
    }

    const params = { owner: pr.owner, repo: pr.repo, comment_id: thread.commentID, body };

    await (thread.source === 'review'
      ? client.request('PATCH /repos/{owner}/{repo}/pulls/comments/{comment_id}', params)
      : client.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}', params));
  }
}

function toCommentURL(pr: PullRequestRef, thread: FindingThread): string {
  const anchor =
    thread.source === 'review'
      ? `discussion_r${thread.commentID}`
      : `issuecomment-${thread.commentID}`;

  return `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}#${anchor}`;
}

interface ReviewedChange {
  head: string;
  key?: NetChangeKey;
  failedCalls: number;
}

// a fixes-only run vouches for its head only when a fix call judged a fix on top of a lens review with
// no failed call, since its calls read the net diff but no lens did; any other such run keeps what
// the summary before it held, so the check passes no commit that no call read
async function readReviewedChange(
  client: GitHubClient,
  pr: PullRequestRef,
  result: ReviewResult,
  previous: SummaryMarker | null,
): Promise<ReviewedChange> {
  const failedCalls = result.failedCalls.length;

  const isVouched =
    result.fixesOnly !== true ||
    ((result.fixChecks ?? []).length > 0 && findLensHead(previous) !== null);

  if (isVouched) {
    return { head: result.head, key: await readNetChangeKey(client, pr, result.head), failedCalls };
  }

  if (previous === null) {
    return { head: result.base, failedCalls };
  }

  const kept = { head: previous.head, failedCalls: previous.failedCalls + failedCalls };

  return previous.key === undefined ? kept : { ...kept, key: previous.key };
}

interface RunFields {
  checked?: string[];
  lensHead?: string;
}

// a fixes-only run's marker lists the fixes its calls judged fixed, which marks it as no lens review,
// and carries the head of the last lens review with no failed call; a lens review sets that head
// only when none of its calls failed
function buildRunFields(result: ReviewResult, previous: SummaryMarker | null): RunFields {
  if (result.fixesOnly !== true) {
    return result.failedCalls.length === 0 ? { lensHead: result.head } : {};
  }

  const fixed = (result.fixChecks ?? []).filter((check) => check.fixed);
  const lensHead = findLensHead(previous);

  return {
    checked: fixed.map((check) => check.findingID),
    ...(lensHead === null ? {} : { lensHead }),
  };
}

async function writeSummaryComment(
  client: GitHubClient,
  pr: PullRequestRef,
  before: PullRequestState,
  body: string,
): Promise<void> {
  if (before.summary === null) {
    await createIssueComment(client, pr, body);

    return;
  }

  await client.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}', {
    owner: pr.owner,
    repo: pr.repo,
    comment_id: before.summary.commentID,
    body,
  });
}
