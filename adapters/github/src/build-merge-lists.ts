import type { ReviewResult } from '@noslop/contract';
import type { SummaryMarker } from './summary-marker';

export interface MergeLists {
  checkedMerges?: string[];
  rejectedMerges?: string[];
}

// the merge lists of the summary marker after a review, each left out when empty: the merges counted
// as checked and the rejected ones the check reads; a later verdict on a merge replaces an earlier one
export function buildMergeLists(previous: SummaryMarker | null, result: ReviewResult): MergeLists {
  const checkedMerges = buildCheckedMerges(previous, result);
  const rejectedMerges = buildRejectedMerges(previous, result);

  return {
    ...(checkedMerges.length === 0 ? {} : { checkedMerges }),
    ...(rejectedMerges.length === 0 ? {} : { rejectedMerges }),
  };
}

// the ones the summary before held, then each merge whose resolution this run judged sound, each once
function buildCheckedMerges(previous: SummaryMarker | null, result: ReviewResult): string[] {
  const checks = result.resolutionChecks ?? [];

  const judged = new Set(checks.map((check) => check.merge));

  const sound = checks.filter((check) => check.sound).map((check) => check.merge);
  const kept = (previous?.checkedMerges ?? []).filter((merge) => !judged.has(merge));

  return [...new Set([...kept, ...sound])];
}

// the ones the summary before held, then each merge this run judged not sound with no finding, whose
// findings would fail the check on their own; a lens review starts the list again
function buildRejectedMerges(previous: SummaryMarker | null, result: ReviewResult): string[] {
  if (result.fixesOnly !== true) {
    return [];
  }

  const checks = result.resolutionChecks ?? [];

  const judged = new Set(checks.map((check) => check.merge));

  const rejected = checks
    .filter((check) => !check.sound && check.findingIDs.length === 0)
    .map((check) => check.merge);

  const kept = (previous?.rejectedMerges ?? []).filter((merge) => !judged.has(merge));

  return [...new Set([...kept, ...rejected])];
}
