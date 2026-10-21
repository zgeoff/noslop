import type { StoredReview } from '@noslop/sqlite';

// the base the commits of a lens review count from: a delta review's base is the head of the review
// before it, a commit of the pull request, so the walk follows each such head back to the base of
// the review that read it; null when the store holds no lens review of the head
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
