import type { ReviewedRange } from './read-fix-confirmations';
import type { SummaryMarker } from './summary-marker';

// the range the review a summary marker records covered, so a `fixed` answer that comes after that
// review can count it as read; a marker from before the range was kept, or a review with a failed
// call, gives none
export function toReviewedRange(marker: SummaryMarker): ReviewedRange | null {
  if (marker.base === undefined || marker.failedCalls > 0) {
    return null;
  }

  return {
    base: marker.base,
    head: marker.head,
    reported: marker.reported,
    notReviewed: marker.notReviewed ?? [],
  };
}
