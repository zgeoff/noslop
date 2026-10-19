import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';
import type { FixConfirmation } from './format-summary-comment';
import { readFixCoverage } from './read-fix-coverage';
import type { FindingThread } from './read-pull-request-state';
import { readRangeCommits } from './read-range-commits';

// one review as the confirmation reads it: the range it covered, the findings it reported, and the
// files it left out
export interface ReviewedRange {
  base: string;
  head: string;
  reported: readonly string[];
  notReviewed: readonly string[];
}

export interface FixConfirmationsInput {
  threads: readonly FindingThread[];
  dispositions: readonly Disposition[];

  // the commits a `fixed` answer can name, from readFixCommits
  commits: readonly string[];
  review: ReviewedRange;

  // each `<finding id>:<commit>` fix an earlier review confirmed
  held: ReadonlySet<string>;
}

// a `fixed` finding is confirmed while no review reports it again, once a review whose range holds the
// fix commit has read the fix; the commit may change any file, since a fix such as a missing test
// lives beside the finding's file, and a fix outside the range keeps the earlier review's word
export async function readFixConfirmations(
  client: GitHubClient,
  pr: PullRequestRef,
  input: FixConfirmationsInput,
): Promise<FixConfirmation[]> {
  const review = input.review;

  const range = await readRangeCommits(client, pr, review.base, review.head);

  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));
  const reported = new Set(review.reported);

  // a review that left the finding's file out read nothing of it, so its silence confirms no fix; a
  // not-reviewed file never fails the check alone, but a pending fix that reaches one stays
  // unconfirmed, and its open finding fails the check
  const skipped = new Set(review.notReviewed);
  const sincePosted = new Map<string, Promise<string[]>>();

  const readSincePosted = (posted: string): Promise<string[]> => {
    const commits = sincePosted.get(posted) ?? readRangeCommits(client, pr, posted, review.head);

    sincePosted.set(posted, commits);

    return commits;
  };

  const confirmations = input.threads.map(async (thread) => {
    const disposition = latest.get(thread.marker.id);

    if (disposition?.kind !== 'fixed') {
      return [];
    }

    const commit = disposition.value;
    const match = findOneCommit(input.commits, commit);
    const posted = thread.marker.head;

    // a full review covers the whole branch, so only a commit after the head that posted the finding
    // is a fix of it; a marker without that head leaves the review's range alone to decide
    const after = posted === undefined ? range : await readSincePosted(posted);

    const isInRange =
      range.includes(match ?? '') &&
      after.includes(match ?? '') &&
      !skipped.has(thread.marker.path);

    const coverage =
      isInRange && match !== null && skipped.size > 0
        ? await readFixCoverage(client, pr, {
            commit: match,
            head: review.head,
            skipped,
            findingPath: thread.marker.path,
          })
        : { changesSkipped: false, failure: null };

    const isRead = isInRange && !coverage.changesSkipped;
    const isHeld = input.held.has(`${thread.marker.id}:${commit}`);
    const fixed = !reported.has(thread.marker.id) && match !== null && (isRead || isHeld);

    return [
      {
        id: thread.marker.id,
        title: thread.marker.title,
        commit,
        fixed,
        ...(fixed || coverage.failure === null ? {} : { failure: coverage.failure }),
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
