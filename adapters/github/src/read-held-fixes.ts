import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { HeldFixes } from './build-held-fixes';
import { buildHeldFixes } from './build-held-fixes';
import type { GitHubClient } from './create-github-connection';
import type { FixCommits } from './read-fix-commits';
import { readFixConfirmations } from './read-fix-confirmations';
import type { FindingThread } from './read-pull-request-state';
import type { SummaryMarker } from './summary-marker';
import { toReviewedRanges } from './to-reviewed-ranges';

export interface HeldFixesInput {
  threads: readonly FindingThread[];
  dispositions: readonly Disposition[];
  fixCommits: FixCommits;
  marker: SummaryMarker;
}

// reads from GitHub what each kept range of a summary marker read of each `fixed` answer, and leaves
// the verdict to buildHeldFixes; a partial range is not read, so it confirms no fix
export async function readHeldFixes(
  client: GitHubClient,
  pr: PullRequestRef,
  input: HeldFixesInput,
): Promise<HeldFixes> {
  const ranges = await Promise.all(
    toReviewedRanges(input.marker).map(async (review) => ({
      reported: review.reported,
      confirmations: review.isPartial
        ? []
        : await readFixConfirmations(client, pr, {
            threads: input.threads,
            dispositions: input.dispositions,
            fixCommits: input.fixCommits,
            review,
            held: new Set(),
          }),
    })),
  );

  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));

  const answers = input.threads.flatMap((thread) => {
    const disposition = latest.get(thread.marker.id);

    return disposition?.kind === 'fixed'
      ? [{ id: thread.marker.id, commit: disposition.value }]
      : [];
  });

  return buildHeldFixes({ answers, marker: input.marker, ranges });
}
