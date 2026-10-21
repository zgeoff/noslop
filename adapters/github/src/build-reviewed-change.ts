import type { ReviewResult } from '@noslop/contract';
import { findLensHead } from './find-lens-head';
import type { NetChangeKey } from './net-change-key';
import type { SummaryMarker } from './summary-marker';

export type ReviewedChange =
  | { kind: 'own'; failedCalls: number }
  | { kind: 'kept'; head: string; key?: NetChangeKey; failedCalls: number };

// a fixes-only run vouches for its head only when a fix call judged a fix on top of a lens review with
// no failed call, since its calls read the net diff but no lens did; any other such run keeps what
// the summary before it held, so the check passes no commit that no call read
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

  // with no clean lens review, the latest lens review failed, and its failures stay until one passes;
  // otherwise an earlier failure was a fix call's, which this run asked again or no longer needs
  const carried = findLensHead(previous) === null ? previous.failedCalls : 0;
  const kept = { kind: 'kept' as const, head: previous.head, failedCalls: carried + failedCalls };

  return previous.key === undefined ? kept : { ...kept, key: previous.key };
}
