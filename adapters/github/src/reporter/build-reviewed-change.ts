import type { ReviewResult } from '@noslop/contract';
import type { NetChangeKey } from '../markers/net-change-key';
import type { SummaryMarker } from '../markers/summary-marker';
import { findLensHead } from './find-lens-head';

export type ReviewedChange =
  | { kind: 'own'; failedCalls: number }
  | { kind: 'kept'; head: string; key?: NetChangeKey; failedCalls: number };

export function buildReviewedChange(
  result: ReviewResult,
  previous: SummaryMarker | null,
): ReviewedChange {
  const failedCalls = result.failedCalls.length;

  const isVouched =
    result.fixesOnly !== true ||
    ((result.fixChecks ?? []).length > 0 && findLensHead(previous) !== null);

  if (isVouched) {
    return { kind: 'own', failedCalls };
  }

  if (previous === null) {
    return { kind: 'kept', head: result.base, failedCalls };
  }

  const carried = findLensHead(previous) === null ? previous.failedCalls : 0;
  const kept = { kind: 'kept' as const, head: previous.head, failedCalls: carried + failedCalls };

  return previous.key === undefined ? kept : { ...kept, key: previous.key };
}
