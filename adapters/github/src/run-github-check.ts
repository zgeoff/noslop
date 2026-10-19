import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { CheckOutcome } from './build-check-outcome';
import { buildCheckOutcome } from './build-check-outcome';
import { createFormsReplies } from './create-forms-replies';
import type { GitHubClient, GitHubConnection } from './create-github-connection';
import { readFixCommits } from './read-fix-commits';
import { readFixConfirmations } from './read-fix-confirmations';
import type { PullRequestState } from './read-pull-request-state';
import { readPullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';
import { toReviewedRange } from './to-reviewed-range';

export const CHECK_NAME = 'noslop';

export interface GitHubCheckOptions {
  failedReporters: readonly string[];

  // the state a caller already read; read again from GitHub when absent
  state?: PullRequestState;
}

// sets the noslop check run on the pull request's head from what GitHub holds: it answers free-text
// replies, reads every disposition, checks each deferral's issue, and passes or fails the check
export async function runGitHubCheck(
  connection: GitHubConnection,
  pr: PullRequestRef,
  options: GitHubCheckOptions,
): Promise<CheckOutcome> {
  const client = connection.client;

  const state = await (options.state === undefined
    ? readPullRequestState(connection, pr)
    : Promise.resolve(options.state));

  await createFormsReplies(client, pr, state.threads);

  const dispositions = await readThreadDispositions(client, pr, state.threads);
  const existingIssues = await readExistingIssues(client, pr, dispositions);

  const commits = await readFixCommits(client, pr, {
    commits: state.commits,
    dispositions,
    head: state.headSha,
  });

  const summary = state.summary?.marker ?? null;

  const confirmed = await readCheckConfirmed(client, pr, { state, dispositions, commits });

  const outcome = buildCheckOutcome({
    findings: state.threads.map((thread) => thread.marker),
    dispositions,
    summary,
    confirmed,
    currentHead: state.headSha,
    commits,
    existingIssues,
    failedReporters: options.failedReporters,
    unreadable: state.unreadable,
  });

  await client.request('POST /repos/{owner}/{repo}/check-runs', {
    owner: pr.owner,
    repo: pr.repo,
    name: CHECK_NAME,
    head_sha: state.headSha,
    status: 'completed',
    conclusion: outcome.conclusion,
    output: { title: outcome.title, summary: outcome.summary || outcome.title },
  });

  return outcome;
}

interface CheckConfirmedInput {
  state: PullRequestState;
  dispositions: readonly Disposition[];
  commits: readonly string[];
}

// the fixes the check counts: each one a review confirmed, and each one answered after the review of
// the head, which that review's range held and read, so the answer needs no further review
async function readCheckConfirmed(
  client: GitHubClient,
  pr: PullRequestRef,
  input: CheckConfirmedInput,
): Promise<string[]> {
  const marker = input.state.summary?.marker;

  if (marker === undefined) {
    return [];
  }

  const range = toReviewedRange(marker);

  if (range === null || marker.head !== input.state.headSha) {
    return marker.confirmed;
  }

  const confirmations = await readFixConfirmations(client, pr, {
    threads: input.state.threads,
    dispositions: input.dispositions,
    commits: input.commits,
    review: range,
    held: new Set(marker.confirmed),
  });

  return [
    ...new Set([
      ...marker.confirmed,
      ...confirmations.filter((item) => item.fixed).map((item) => `${item.id}:${item.commit}`),
    ]),
  ];
}

async function readExistingIssues(
  client: GitHubClient,
  pr: PullRequestRef,
  dispositions: readonly Disposition[],
): Promise<Set<string>> {
  const values = new Set(
    dispositions.filter((item) => item.kind === 'deferred').map((item) => item.value),
  );

  const existing = new Set<string>();

  for (const value of values) {
    const issue = parseIssueRef(value, pr);

    if (issue === null) {
      continue;
    }

    const found = await hasIssue(client, issue);

    if (found) {
      existing.add(value);
    }
  }

  return existing;
}

interface IssueRef {
  owner: string;
  repo: string;
  number: number;
}

// `#12` names an issue of the pull request's repo; `owner/repo#12` and an issue URL name any repo
function parseIssueRef(value: string, pr: PullRequestRef): IssueRef | null {
  const token = value.split(/\s/u, 1)[0] ?? '';

  const url =
    /^https:\/\/github\.com\/(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)\/issues\/(?<number>\d+)$/u.exec(
      token,
    );

  const short = /^(?:(?<owner>[\w.-]+)\/(?<repo>[\w.-]+))?#(?<number>\d+)$/u.exec(token);
  const groups = url?.groups ?? short?.groups;

  if (groups === undefined) {
    return null;
  }

  return {
    owner: groups['owner'] ?? pr.owner,
    repo: groups['repo'] ?? pr.repo,
    number: Number(groups['number']),
  };
}

async function hasIssue(client: GitHubClient, issue: IssueRef): Promise<boolean> {
  try {
    await client.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number,
    });

    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }

    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
}
