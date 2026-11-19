import type { ReviewResult } from '@noslop/contract';
import { CRITERION_SEVERITY } from '@noslop/contract';
import { buildMockReviewResult } from '@noslop/contract/test-utils/build-mock-review-result';
import { writeReview } from '../reviews/write-review';
import type { Store } from '../store/load-store';

export async function seedUnreadableFinding(
  store: Store,
  input: Partial<ReviewResult> = {},
): Promise<ReviewResult> {
  const review = buildMockReviewResult(input);

  if (review.findings.some((finding) => CRITERION_SEVERITY[finding.criterion] === 'P1')) {
    throw new Error('seedUnreadableFinding takes only findings whose criterion sets P2 or P3');
  }

  await writeReview(store, review);

  // Findings an older noslop stored with a severity that their criterion no longer sets.
  await store
    .updateTable('findings')
    .set({ severity: 'P1' })
    .where('review_id', '=', review.reviewID)
    .execute();

  return review;
}
