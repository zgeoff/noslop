import type { StoredReview } from '@noslop/sqlite';

export function findReviewBase(reviews: readonly StoredReview[], lensHead: string): string | null {
  const lens = reviews.find((review) => review.isLensReview && review.head === lensHead);

  return lens === undefined ? null : getEarliestBase(reviews, lens.base, new Set([lensHead]));
}

function getEarliestBase(
  reviews: readonly StoredReview[],
  base: string,
  seen: ReadonlySet<string>,
): string {
  const earlier = reviews.find((review) => review.head === base && review.base !== review.head);

  return earlier === undefined || seen.has(base)
    ? base
    : getEarliestBase(reviews, earlier.base, new Set([...seen, base]));
}
