import type { Finding, PullRequestRef, Reporter, ReviewResult } from '@noslop/contract';
import type { GitHubClient, GitHubConnection } from './create-github-connection';
import { formatFindingComment } from './format-finding-comment';
import { formatFixedFindingComment } from './format-fixed-finding-comment';
import type { FixConfirmation } from './format-summary-comment';
import { formatSummaryComment } from './format-summary-comment';
import type { CommitFile } from './has-skipped-file';
import { hasSkippedFile } from './has-skipped-file';
import type { FindingThread, PullRequestState } from './read-pull-request-state';
import { readPullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';
import { runGitHubCheck } from './run-github-check';

export interface GitHubReporterOptions {
  loadConnection: () => Promise<GitHubConnection>;
}

// a re-review after this many reviews of one pull request is past the one re-check
const RECHECKED_REVIEWS = 2;

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

      const connection = await options.loadConnection();

      const client = connection.client;

      const before = await readPullRequestState(connection, pr);

      const filed = before.summary?.marker.followUps ?? [];

      const posted = new Set([...before.threads.map((thread) => thread.marker.id), ...filed]);

      const reviews = (before.summary?.marker.reviews ?? 0) + 1;
      const fresh = result.findings.filter((finding) => !posted.has(finding.id));

      const followUps =
        reviews > RECHECKED_REVIEWS
          ? fresh.filter((finding) => finding.lens !== 'security' && !finding.writtenByChange)
          : [];

      const inline = fresh.filter((finding) => !followUps.includes(finding));

      const unanchored = await createReviewComments(client, pr, result.head, inline);

      for (const finding of unanchored) {
        await createIssueComment(client, pr, formatUnanchoredComment(finding, result.head));
      }

      for (const finding of followUps) {
        await createFollowUpIssue(client, pr, finding);
      }

      const confirmations = await buildConfirmations(client, pr, before, result);

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

      const marker = {
        head: result.head,
        reviews,
        reported: result.findings.map((finding) => finding.id),
        failedCalls: result.failedCalls.length,
        followUps: [...filed, ...followUps.map((finding) => finding.id)],
        confirmed: confirmations
          .filter((item) => item.fixed)
          .map((item) => `${item.id}:${item.commit}`),
      };

      await writeSummaryComment(
        client,
        pr,
        before,
        formatSummaryComment(
          result,
          marker,
          { confirmations, posted: before.threads.length },
          links,
        ),
      );

      const outcome = await runGitHubCheck(connection, pr, {
        failedReporters: ctx.failedReporters,
      });

      ctx.logger.info('the noslop check on {head}: {conclusion}', {
        head: result.head.slice(0, 12),
        conclusion: outcome.conclusion,
      });
    },
  };
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
    ].join('\n'),
  });
}

// a `fixed` finding is confirmed while no review reports it again, once a review whose range holds the
// fix commit has read the fix; the commit may change any file, since a fix such as a missing test
// lives beside the finding's file, and a fix outside the range keeps the earlier review's word
async function buildConfirmations(
  client: GitHubClient,
  pr: PullRequestRef,
  before: PullRequestState,
  result: ReviewResult,
): Promise<FixConfirmation[]> {
  const dispositions = await readThreadDispositions(client, pr, before.threads);
  const range = await readRangeCommits(client, pr, result.base, result.head);

  const latest = new Map(dispositions.map((item) => [item.findingID, item]));
  const reported = new Set(result.findings.map((finding) => finding.id));

  // a review that left the finding's file out read nothing of it, so its silence confirms no fix
  const skipped = new Set(result.notReviewed.map((file) => file.path));
  const confirmed = new Set(before.summary?.marker.confirmed);
  const sincePosted = new Map<string, Promise<string[]>>();

  const readSincePosted = (posted: string): Promise<string[]> => {
    const commits = sincePosted.get(posted) ?? readRangeCommits(client, pr, posted, result.head);

    sincePosted.set(posted, commits);

    return commits;
  };

  const confirmations = before.threads.map(async (thread) => {
    const disposition = latest.get(thread.marker.id);

    if (disposition?.kind !== 'fixed') {
      return [];
    }

    const commit = disposition.value;
    const match = findOneCommit(before.commits, commit);
    const posted = thread.marker.head;

    // a full review covers the whole branch, so only a commit after the head that posted the finding
    // is a fix of it; a marker without that head leaves the review's range alone to decide
    const after = posted === undefined ? range : await readSincePosted(posted);

    const isInRange =
      range.includes(match ?? '') &&
      after.includes(match ?? '') &&
      !skipped.has(thread.marker.path);

    const fixFiles =
      isInRange && match !== null && skipped.size > 0
        ? await readCommitFiles(client, pr, match)
        : { files: [], failure: null };

    // a file list GitHub could not give whole counts as one that touches a skipped file
    const isRead =
      isInRange && fixFiles.failure === null && !hasSkippedFile(fixFiles.files, skipped);

    const isHeld = confirmed.has(`${thread.marker.id}:${commit}`);
    const fixed = !reported.has(thread.marker.id) && match !== null && (isRead || isHeld);

    return [
      {
        id: thread.marker.id,
        title: thread.marker.title,
        commit,
        fixed,
        ...(fixed || fixFiles.failure === null ? {} : { failure: fixFiles.failure }),
      },
    ];
  });

  const all = await Promise.all(confirmations);

  return all.flat();
}

// the one branch commit a `fixed` sha names; a prefix that 2 commits share names neither
function findOneCommit(commits: readonly string[], sha: string): string | null {
  const matches = commits.filter((commit) => commit.startsWith(sha));

  return matches.length === 1 ? (matches[0] ?? null) : null;
}

// the commits after the base up to the head; a base that GitHub no longer holds, such as a head that
// a force push dropped, gives none, so no fix counts through it
async function readRangeCommits(
  client: GitHubClient,
  pr: PullRequestRef,
  base: string,
  head: string,
): Promise<string[]> {
  try {
    const response = await client.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
      owner: pr.owner,
      repo: pr.repo,
      basehead: `${base}...${head}`,
    });

    return response.data.commits.map((commit) => commit.sha);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
      return [];
    }

    throw error;
  }
}

// GitHub lists at most 3,000 files of one commit, 100 to a page
const COMMIT_FILES_PER_PAGE = 100;
const COMMIT_FILE_PAGES = 30;

interface ReadCommitFiles {
  files: CommitFile[];

  // why GitHub gave no whole file list, which the summary shows beside the unconfirmed fix
  failure: string | null;
}

// reads every file a commit changes from GitHub, page by page; a failed read, or a commit past
// GitHub's file cap, gives the failure in place of a whole list
async function readCommitFiles(
  client: GitHubClient,
  pr: PullRequestRef,
  commit: string,
): Promise<ReadCommitFiles> {
  const files: CommitFile[] = [];

  try {
    for (let page = 1; page <= COMMIT_FILE_PAGES; page += 1) {
      const response = await client.request('GET /repos/{owner}/{repo}/commits/{ref}', {
        owner: pr.owner,
        repo: pr.repo,
        ref: commit,
        per_page: COMMIT_FILES_PER_PAGE,
        page,
      });

      const listed = response.data.files ?? [];

      files.push(
        ...listed.map((file) =>
          file.previous_filename === undefined
            ? { filename: file.filename }
            : { filename: file.filename, previous_filename: file.previous_filename },
        ),
      );

      if (listed.length < COMMIT_FILES_PER_PAGE) {
        return { files, failure: null };
      }
    }

    return { files, failure: 'the fix commit changes more files than GitHub lists' };
  } catch (error) {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number'
        ? `HTTP ${error.status}`
        : String(error);

    return { files, failure: `GitHub could not list the files of the fix commit (${status})` };
  }
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
