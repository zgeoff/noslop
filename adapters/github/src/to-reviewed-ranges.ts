import type { ReviewedRange } from './read-fix-confirmations';
import type { SummaryMarker } from './summary-marker';

// the ranges a summary marker keeps, newest first, so a `fixed` answer that comes after a review can
// count it as read: the latest review's, unless it had a failed call, then the earlier ones
export function toReviewedRanges(marker: SummaryMarker): ReviewedRange[] {
  const earlier = marker.earlier ?? [];

  if (marker.base === undefined || marker.failedCalls > 0) {
    return earlier;
  }

  return [
    {
      base: marker.base,
      head: marker.head,
      reported: marker.reported,
      notReviewed: marker.notReviewed ?? [],
    },
    ...earlier,
  ];
}
