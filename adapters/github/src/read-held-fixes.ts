import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';
import type { FixVerdict } from './pick-fix-verdict';
import { pickFixVerdict } from './pick-fix-verdict';
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

export interface HeldFixes {
  // each `<finding id>:<commit>` fix that the reviews a summary marker records hold
  confirmed: string[];

  // why GitHub could not show a fix whole, by finding id, for each fix they leave unconfirmed
  failures: Map<string, string>;
}

// the fixes the reviews of a summary marker hold, newest first: the latest review's own decisions,
// then each kept range, which counts a `fixed` answer that came after the review; a review that
// reported the finding again rejects every older confirmation of it
export async function readHeldFixes(
  client: GitHubClient,
  pr: PullRequestRef,
  input: HeldFixesInput,
): Promise<HeldFixes> {
  const marker = input.marker;
  const ranges = toReviewedRanges(marker);

  const read = await Promise.all(
    ranges.map((review) =>
      readFixConfirmations(client, pr, {
        threads: input.threads,
        dispositions: input.dispositions,
        fixCommits: input.fixCommits,
        review,
        held: new Set(),
      }),
    ),
  );

  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));

  const confirmed: string[] = [];

  const failures = new Map<string, string>();

  for (const thread of input.threads) {
    const id = thread.marker.id;
    const disposition = latest.get(id);

    if (disposition?.kind !== 'fixed') {
      continue;
    }

    const key = `${id}:${disposition.value}`;

    const verdicts: FixVerdict[] = [
      pickMarkerVerdict(marker, id, key),
      ...ranges.map((range, index): FixVerdict => {
        if (range.reported.includes(id)) {
          return 'rejected';
        }

        return read[index]?.find((item) => item.id === id)?.fixed === true ? 'confirmed' : 'none';
      }),
    ];

    if (pickFixVerdict(verdicts) === 'confirmed') {
      confirmed.push(key);
      continue;
    }

    const failure = read.flat().find((item) => item.id === id && item.failure !== undefined);

    if (failure?.failure !== undefined) {
      failures.set(id, failure.failure);
    }
  }

  return { confirmed, failures };
}

// the latest review's own decision, which already weighed every review before it for the answers it
// saw
function pickMarkerVerdict(marker: SummaryMarker, id: string, key: string): FixVerdict {
  if (marker.reported.includes(id)) {
    return 'rejected';
  }

  return marker.confirmed.includes(key) ? 'confirmed' : 'none';
}
