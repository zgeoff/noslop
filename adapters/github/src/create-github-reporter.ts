import type { Finding, PullRequestRef, Reporter, ReviewResult } from '@noslop/contract';
import type { GitHubClient, GitHubConnection } from './create-github-connection';
import { formatFindingComment } from './format-finding-comment';
import type { FixConfirmation } from './format-summary-comment';
import { formatSummaryComment } from './format-summary-comment';
import { readFixedFindings } from './read-fixed-findings';
import type { PullRequestState } from './read-pull-request-state';
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
        await createIssueComment(client, pr, formatUnanchoredComment(finding));
      }

      for (const finding of followUps) {
        await createFollowUpIssue(client, pr, finding);
      }

      const confirmations = await buildConfirmations(client, pr, before, result);

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
        formatSummaryComment(result, marker, confirmations),
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
      comments: findings.map((finding) => toReviewComment(finding)),
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
        ...toReviewComment(finding),
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

function toReviewComment(finding: Finding) {
  const range = finding.anchor.startLine < finding.anchor.endLine;

  return {
    path: finding.anchor.path,
    line: finding.anchor.endLine,
    side: 'RIGHT' as const,
    body: formatFindingComment(finding),
    ...(range ? { start_line: finding.anchor.startLine, start_side: 'RIGHT' as const } : {}),
  };
}

function isUnprocessable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 422;
}

function formatUnanchoredComment(finding: Finding): string {
  const anchor = `\`${finding.anchor.path}:${finding.anchor.startLine}-${finding.anchor.endLine}\``;

  return [
    `GitHub cannot anchor this finding at ${anchor}, outside the diff. Answer it in a comment that starts with its id, \`${finding.id}\`.`,
    '',
    formatFindingComment(finding),
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

// a `fixed` finding is confirmed while no review reports it again, once a review whose range holds a
// fix commit that changes the finding's file has read the fix; a fix outside the range keeps the
// earlier review's word
async function buildConfirmations(
  client: GitHubClient,
  pr: PullRequestRef,
  before: PullRequestState,
  result: ReviewResult,
): Promise<FixConfirmation[]> {
  const dispositions = await readThreadDispositions(client, pr, before.threads);
  const changesFile = await readFixedFindings(client, pr, before.threads, dispositions);
  const range = await readRangeCommits(client, pr, result.base, result.head);

  const latest = new Map(dispositions.map((item) => [item.findingID, item]));
  const reported = new Set(result.findings.map((finding) => finding.id));
  const confirmed = new Set(before.summary?.marker.confirmed);

  return before.threads.flatMap((thread) => {
    const disposition = latest.get(thread.marker.id);

    if (disposition?.kind !== 'fixed') {
      return [];
    }

    const commit = disposition.value;
    const isRead = range.some((sha) => sha.startsWith(commit)) && changesFile.has(thread.marker.id);
    const isHeld = confirmed.has(`${thread.marker.id}:${commit}`);

    return [
      {
        id: thread.marker.id,
        title: thread.marker.title,
        commit,
        fixed: !reported.has(thread.marker.id) && (isRead || isHeld),
      },
    ];
  });
}

// the commits after the review's base up to its head
async function readRangeCommits(
  client: GitHubClient,
  pr: PullRequestRef,
  base: string,
  head: string,
): Promise<string[]> {
  const response = await client.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
    owner: pr.owner,
    repo: pr.repo,
    basehead: `${base}...${head}`,
  });

  return response.data.commits.map((commit) => commit.sha);
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
