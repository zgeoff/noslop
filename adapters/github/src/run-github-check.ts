import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { CheckOutcome } from './build-check-outcome';
import { buildCheckOutcome } from './build-check-outcome';
import { createFormsReplies } from './create-forms-replies';
import type { GitHubClient, GitHubConnection } from './create-github-connection';
import { readFixedFindings } from './read-fixed-findings';
import type { PullRequestState } from './read-pull-request-state';
import { readPullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';

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
  const fixChangesFile = await readFixedFindings(client, pr, state.threads, dispositions);

  const outcome = buildCheckOutcome({
    findings: state.threads.map((thread) => thread.marker),
    dispositions,
    summary: state.summary?.marker ?? null,
    currentHead: state.headSha,
    commits: state.commits,
    existingIssues,
    fixChangesFile,
    failedReporters: options.failedReporters,
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
