import type { ReviewedRange } from './read-fix-confirmations';
import type { SummaryMarker } from './summary-marker';

// a range a summary marker keeps; a review with a failed call keeps a partial one, which rejects the
// findings it reported and confirms no fix
export interface KeptRange extends ReviewedRange {
  isPartial: boolean;
}

// the ranges a summary marker keeps, newest first, so a `fixed` answer that comes after a review can
// count it as read: the latest review's, then the earlier ones; a partial range stays in order, so
// its rejections outlive every older confirmation
export function toReviewedRanges(marker: SummaryMarker): KeptRange[] {
  const earlier = (marker.earlier ?? []).map((range) => ({
    base: range.base,
    head: range.head,
    reported: range.reported,
    notReviewed: range.notReviewed,
    notReviewedByLens: range.notReviewedByLens ?? [],
    isPartial: range.partial === true,
  }));

  if (marker.base === undefined) {
    return earlier;
  }

  return [
    {
      base: marker.base,
      head: marker.head,
      reported: marker.reported,
      notReviewed: marker.notReviewed ?? [],
      notReviewedByLens: marker.notReviewedByLens ?? [],
      isPartial: marker.failedCalls > 0,
    },
    ...earlier,
  ];
}
