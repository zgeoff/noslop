import type {
  Finding,
  PullRequestRef,
  Reporter,
  ReporterContext,
  ReviewResult,
} from '@noslop/contract';
import { buildMergeLists } from './build-merge-lists';
import type { GitHubClient, GitHubConnection } from './create-github-connection';
import { followUpMarkerSchema } from './follow-up-marker';
import { formatFindingComment } from './format-finding-comment';
import { formatFixedFindingComment } from './format-fixed-finding-comment';
import { formatMarker } from './format-marker';
import { formatRewrittenComment } from './format-rewritten-comment';
import type { FixConfirmation } from './format-summary-comment';
import { formatSummaryComment } from './format-summary-comment';
import { parseMarker } from './parse-marker';
import { planReviewPost } from './plan-review-post';
import { readAllPages } from './read-all-pages';
import { readFixCommits } from './read-fix-commits';
import type { ReviewedRange } from './read-fix-confirmations';
import { readFixConfirmations } from './read-fix-confirmations';
import { readHeldFixes } from './read-held-fixes';
import type { FindingThread, PullRequestState } from './read-pull-request-state';
import { readPullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';
import { runGitHubCheck } from './run-github-check';
import type { SummaryMarker } from './summary-marker';
import type { KeptRange } from './to-reviewed-ranges';
import { toReviewedRanges } from './to-reviewed-ranges';

export interface GitHubReporterOptions {
  loadConnection: () => Promise<GitHubConnection>;
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
        runReviewPost(options.loadConnection, pr, result, ctx),
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
  loadConnection: () => Promise<GitHubConnection>,
  pr: PullRequestRef,
  result: ReviewResult,
  ctx: ReporterContext,
): Promise<void> {
  const connection = await loadConnection();

  const client = connection.client;

  const before = await readPullRequestState(connection, pr);

  const filed = before.summary?.marker.followUps ?? [];

  const posted = new Set([...before.threads.map((thread) => thread.marker.id), ...filed]);

  const plan = planReviewPost({ summary: before.summary?.marker ?? null, posted }, result);
  const own = toOwnRange(result);

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

  const confirmations = await readConfirmations(client, pr, before, own);

  // the summary gives the fixes-only run's reason for each fix it judged not fixed
  for (const item of confirmations) {
    const check = result.fixChecks?.find((entry) => entry.findingID === item.id);

    if (!item.fixed && check?.fixed === false) {
      item.failure = check.reason;
    }
  }

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

  const marker = {
    head: result.head,
    ...buildRangeFields(own, before.summary?.marker ?? null),
    ...merges,
    reviews: plan.reviews,
    reviewIDs: plan.reviewIDs,
    reported: [...own.reported],
    failedCalls: result.failedCalls.length,
    followUps: [...filed, ...followUps.map((finding) => finding.id)],
    confirmed: confirmations
      .filter((item) => item.fixed)
      .map((item) => `${item.id}:${item.commit}`),
    startedAt: result.startedAt,
  };

  await writeSummaryComment(
    client,
    pr,
    before,
    formatSummaryComment(result, marker, { confirmations, posted: before.threads.length }, links),
  );

  await runCheck(connection, pr, result.head, ctx);
}

// the range this review read; a fixes-only run reported no finding, so a fix it judged not fixed
// counts as reported again, and its range reads only the fixes it judged fixed; a finding the review
// dropped as answered `not-a-defect` counts as reported, so it confirms no fix of the answered finding
function toOwnRange(result: ReviewResult): KeptRange {
  const checks = result.fixChecks;
  const rejected = (checks ?? []).filter((check) => !check.fixed);

  const answered = result.dropped.flatMap((item) =>
    item.answeredID === undefined ? [] : [item.answeredID],
  );

  return {
    base: result.base,
    head: result.head,
    reported: [
      ...new Set([
        ...result.findings.map((finding) => finding.id),
        ...rejected.map((check) => check.findingID),
        ...answered,
      ]),
    ],
    notReviewed: result.notReviewed.map((file) => file.path),
    notReviewedByLens: toLensNotReviewedPaths(result),
    isPartial: result.failedCalls.length > 0,
    ...(checks === undefined
      ? {}
      : { checked: checks.filter((check) => check.fixed).map((check) => check.findingID) }),
  };
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

function formatUnanchoredComment(finding: Finding, head: string): string {
  const anchor = `\`${finding.anchor.path}:${finding.anchor.startLine}-${finding.anchor.endLine}\``;

  return [
    `GitHub cannot anchor this finding at ${anchor}, outside the diff. Answer it in a comment that starts with its id, \`${finding.id}\`.`,
    '',
    formatFindingComment(finding, head),
  ].join('\n');
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

// the most characters of review ranges the summary marker keeps, far under GitHub's comment limit
const MARKER_PATH_CHARS = 16_000;

// the most ranges of earlier reviews the summary marker keeps beside the latest one
const EARLIER_RANGES = 4;

interface RangeFields {
  base?: string;
  notReviewed?: string[];
  notReviewedByLens?: SummaryMarker['notReviewedByLens'];
  checked?: string[];
  earlier?: SummaryMarker['earlier'];
}

// the ranges the summary marker keeps for a `fixed` answer after the review: its own, then the newest
// earlier ones that fit the budget, which counts them as the marker writes them, escapes included; a
// review whose own range does not fit keeps none, so such an answer waits for the next review
function buildRangeFields(own: KeptRange, previous: SummaryMarker | null): RangeFields {
  const notReviewed = [...own.notReviewed];

  const notReviewedByLens = own.notReviewedByLens.map((file) => ({
    path: file.path,
    lenses: [...file.lenses],
  }));

  // a repost of a review keeps its own range once, so it evicts no earlier one; another review of the
  // same range keeps its verdicts, so a rejection it holds outlives every older confirmation
  const earlier = (previous === null ? [] : toReviewedRanges(previous))
    .filter((range) => !isSameRange(range, own))
    .slice(0, EARLIER_RANGES)
    .map((range) => {
      const kept: NonNullable<SummaryMarker['earlier']>[number] = {
        base: range.base,
        head: range.head,
        reported: [...range.reported],
        notReviewed: [...range.notReviewed],
      };

      if (range.notReviewedByLens.length > 0) {
        kept.notReviewedByLens = range.notReviewedByLens.map((file) => ({
          path: file.path,
          lenses: [...file.lenses],
        }));
      }

      if (range.isPartial) {
        kept.partial = true;
      }

      // an earlier fixes-only range keeps its list, so a reply posted after it never confirms through
      // its silence
      if (range.checked !== undefined) {
        kept.checked = [...range.checked];
      }

      return kept;
    });

  for (let count = earlier.length; count >= 0; count -= 1) {
    const kept = earlier.slice(0, count);

    const fields = {
      base: own.base,
      notReviewed,
      ...(notReviewedByLens.length === 0 ? {} : { notReviewedByLens }),
      ...(own.checked === undefined ? {} : { checked: [...own.checked] }),
      ...(count === 0 ? {} : { earlier: kept }),
    };

    if (formatMarker('summary', fields).length <= MARKER_PATH_CHARS) {
      return fields;
    }
  }

  return {};
}

function isSameRange(range: KeptRange, other: KeptRange): boolean {
  return (
    range.base === other.base &&
    range.head === other.head &&
    range.isPartial === other.isPartial &&
    isSameList(range.checked ?? [], other.checked ?? []) &&
    (range.checked === undefined) === (other.checked === undefined) &&
    isSameList(range.reported, other.reported) &&
    isSameList(range.notReviewed, other.notReviewed) &&
    isSameList(
      range.notReviewedByLens.map((file) => `${file.path}:${file.lenses.join(',')}`),
      other.notReviewedByLens.map((file) => `${file.path}:${file.lenses.join(',')}`),
    )
  );
}

function toLensNotReviewedPaths(result: ReviewResult): { path: string; lenses: string[] }[] {
  return result.notReviewedByLens.map((file) => ({ path: file.path, lenses: [...file.lenses] }));
}

function isSameList(list: readonly string[], other: readonly string[]): boolean {
  return list.length === other.length && list.every((item, index) => item === other[index]);
}

// the fixes this review confirms; a fix answered after the review before it ran, inside that review's
// range, counts as that review read it, as the check counted it, so the answer needs no extra review
async function readConfirmations(
  client: GitHubClient,
  pr: PullRequestRef,
  before: PullRequestState,
  review: ReviewedRange,
): Promise<FixConfirmation[]> {
  const dispositions = await readThreadDispositions(client, pr, before.threads);

  const fixCommits = await readFixCommits(client, pr, {
    commits: before.commits,
    dispositions,
    head: review.head,
    threads: before.threads,
  });

  const previous = before.summary?.marker ?? null;

  // this review's verdict is the newest, so the earlier reviews' word counts only where it is silent
  const earlier =
    previous === null
      ? null
      : await readHeldFixes(client, pr, {
          threads: before.threads,
          dispositions,
          fixCommits,
          marker: previous,
        });

  const held = earlier?.states ?? new Map();

  return readFixConfirmations(client, pr, {
    threads: before.threads,
    dispositions,
    fixCommits,
    review,
    held,
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
    const confirmation = confirmations.find((item) => item.id === thread.marker.id && item.fixed);
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
