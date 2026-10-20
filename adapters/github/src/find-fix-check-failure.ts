import type { ReviewResult } from '@noslop/contract';
import type { FixConfirmation } from './format-summary-comment';

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
