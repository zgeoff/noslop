import type { ReviewResult } from '@noslop/contract';
import type { FixConfirmation } from './format-summary-comment';

// the fixes-only run's reason for a fix it left unconfirmed: the reason of its not-fixed verdict, or,
// for a fix it gave no verdict because its file passes the file limit, that no call read it whole;
// null for a confirmed fix, a run that is no fixes-only run, and a fix with neither
export function findFixCheckFailure(
  result: ReviewResult,
  item: FixConfirmation,
  path: string | null,
): string | null {
  if (item.fixed || result.fixChecks === undefined) {
    return null;
  }

  const check = result.fixChecks.find((entry) => entry.findingID === item.id);

  if (check !== undefined) {
    return check.fixed ? null : check.reason;
  }

  const isTooLarge = result.notReviewed.some(
    (file) => file.path === path && file.reason === 'too-large',
  );

  return isTooLarge ? 'unjudged: its diff passes the file limit, so no call read it whole' : null;
}
