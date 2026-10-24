import type { ReviewResult } from '@noslop/contract';
import type { SummaryMarker } from './summary-marker';

export interface MergeLists {
  checkedMerges?: string[];
  rejectedMerges?: string[];
}

export function buildMergeLists(previous: SummaryMarker | null, result: ReviewResult): MergeLists {
  const checkedMerges = buildCheckedMerges(previous, result);
  const rejectedMerges = buildRejectedMerges(previous, result);

  return {
    ...(checkedMerges.length === 0 ? {} : { checkedMerges }),
    ...(rejectedMerges.length === 0 ? {} : { rejectedMerges }),
  };
}

function buildCheckedMerges(previous: SummaryMarker | null, result: ReviewResult): string[] {
  const checks = result.resolutionChecks ?? [];

  const judged = new Set(checks.map((check) => check.merge));

  const sound = checks.filter((check) => check.sound).map((check) => check.merge);
  const kept = (previous?.checkedMerges ?? []).filter((merge) => !judged.has(merge));

  return [...new Set([...kept, ...sound])];
}

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
