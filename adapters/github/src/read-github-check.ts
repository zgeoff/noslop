import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { CheckOutcome } from './build-check-outcome';
import { buildCheckOutcome } from './build-check-outcome';
import type { GitHubClient, GitHubConnection } from './create-github-connection';
import { findUnreviewedReason } from './find-unreviewed-reason';
import type { FixCommits } from './read-fix-commits';
import { readFixCommits } from './read-fix-commits';
import { readHeldFixes } from './read-held-fixes';
import { readNetChangeKey } from './read-net-change-key';
import type { PullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';

export interface GitHubCheckInput {
  failedReporters: readonly string[];
  state: PullRequestState;
}

// the outcome of the check from what GitHub holds, with no write: it reads every disposition, checks
// each deferral's issue, and passes or fails the check
export async function readGitHubCheck(
  connection: GitHubConnection,
  pr: PullRequestRef,
  input: GitHubCheckInput,
): Promise<CheckOutcome> {
  const client = connection.client;
  const state = input.state;

  const dispositions = await readThreadDispositions(client, pr, state.threads);
  const existingIssues = await readExistingIssues(client, pr, dispositions);

  const fixCommits = await readFixCommits(client, pr, {
    commits: state.commits,
    dispositions,
    head: state.headSha,
    threads: state.threads,
  });

  const summary = state.summary?.marker ?? null;

  const currentKey =
    summary?.key === undefined
      ? { head: state.headSha }
      : await readNetChangeKey(client, pr, state.headSha);

  const isReviewed =
    findUnreviewedReason({ summary, currentHead: state.headSha, currentKey }) === null;

  const fixes = await readCheckFixes(client, pr, { state, dispositions, fixCommits, isReviewed });

  return buildCheckOutcome({
    findings: state.threads.map((thread) => thread.marker),
    dispositions,
    summary,
    confirmed: fixes.confirmed,
    fixFailures: fixes.failures,
    currentHead: state.headSha,
    currentKey,
    commits: fixCommits.commits,
    ambiguous: fixCommits.ambiguous,
    rewritten: toRewrittenCommits(fixCommits),
    existingIssues,
    failedReporters: input.failedReporters,
    unreadable: state.unreadable,
  });
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

    const found = await probeIssue(client, issue);

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

async function probeIssue(client: GitHubClient, issue: IssueRef): Promise<boolean> {
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

interface CheckFixesInput {
  state: PullRequestState;
  dispositions: readonly Disposition[];
  fixCommits: FixCommits;
  isReviewed: boolean;
}

interface CheckFixes {
  confirmed: string[];

  // why GitHub could not show the fix whole, by finding id, for each fix the check leaves unconfirmed
  failures: Map<string, string>;
}

// the fixes the check counts: the ones the reviews of the summary hold, answers after a review among
// them while those reviews read the net change at the head, so such an answer needs no further review
function readCheckFixes(
  client: GitHubClient,
  pr: PullRequestRef,
  input: CheckFixesInput,
): Promise<CheckFixes> {
  const marker = input.state.summary?.marker;

  if (marker === undefined) {
    return Promise.resolve({ confirmed: [], failures: new Map() });
  }

  if (!input.isReviewed) {
    return Promise.resolve({ confirmed: marker.confirmed, failures: new Map() });
  }

  return readHeldFixes(client, pr, {
    threads: input.state.threads,
    dispositions: input.dispositions,
    fixCommits: input.fixCommits,
    marker,
  });
}

// the pull request commit each rewritten `<finding id>:<sha>` answer stands for, where one holds its
// change
function toRewrittenCommits(fixCommits: FixCommits): Map<string, string> {
  const entries = [...fixCommits.rewritten].flatMap(([key, fix]) =>
    fix.commit === null ? [] : [[key, fix.commit] as const],
  );

  return new Map(entries);
}
