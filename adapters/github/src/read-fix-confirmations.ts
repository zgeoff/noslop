import type { Disposition, PullRequestRef } from '@noslop/contract';
import { buildFixConfirmation } from './build-fix-confirmation';
import type { GitHubClient } from './create-github-connection';
import type { FixConfirmation } from './format-summary-comment';
import type { FixState } from './pick-next-fix-state';
import type { FixCommits } from './read-fix-commits';
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
  fixCommits: FixCommits;
  review: ReviewedRange;

  // where each `<finding id>:<commit>` answer stands after the earlier reviews; an answer it lacks is
  // silent
  held: ReadonlyMap<string, FixState>;
}

// reads from GitHub what each `fixed` answer needs against one review, and leaves the decision to
// buildFixConfirmation; the commit may change any file, since a fix such as a missing test lives
// beside the finding's file
export async function readFixConfirmations(
  client: GitHubClient,
  pr: PullRequestRef,
  input: FixConfirmationsInput,
): Promise<FixConfirmation[]> {
  const review = input.review;

  const range = await readRangeCommits(client, pr, review.base, review.head);

  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));

  // a not-reviewed file never fails the check alone, but a pending fix that reaches one stays
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
    const match = findOneCommit(input.fixCommits, commit);
    const posted = thread.marker.head;

    // a full review covers the whole branch, so only a commit after the head that posted the finding
    // is a fix of it; a marker without that head leaves the review's range alone to decide
    const after = posted === undefined ? range : await readSincePosted(posted);
    const isInRange = match !== null && range.includes(match) && after.includes(match);
    const isFileSkipped = skipped.has(thread.marker.path);

    const coverage =
      isInRange && match !== null && !isFileSkipped && skipped.size > 0
        ? await readFixCoverage(client, pr, {
            commit: match,
            head: review.head,
            skipped,
            findingPath: thread.marker.path,
          })
        : { changesSkipped: false, failure: null };

    return [
      buildFixConfirmation({
        id: thread.marker.id,
        title: thread.marker.title,
        commit,
        match,
        isInRange,
        isFileSkipped,
        coverage,
        held: input.held.get(`${thread.marker.id}:${commit}`) ?? 'silent',
        isReported: review.reported.includes(thread.marker.id),
      }),
    ];
  });

  const all = await Promise.all(confirmations);

  return all.flat();
}

// the one branch commit a `fixed` sha names; a prefix that 2 commits share names neither, and so does
// one that GitHub finds ambiguous
function findOneCommit(fixCommits: FixCommits, sha: string): string | null {
  if (fixCommits.ambiguous.includes(sha)) {
    return null;
  }

  const matches = fixCommits.commits.filter((commit) => commit.startsWith(sha));

  return matches.length === 1 ? (matches[0] ?? null) : null;
}
