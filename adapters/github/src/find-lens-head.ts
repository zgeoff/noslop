import type { SummaryMarker } from './summary-marker';

// the head of the latest lens review with no failed call; a marker written before the field counts
// only its own review, a lens review with no failed call
export function findLensHead(marker: SummaryMarker | null): string | null {
  if (marker === null) {
    return null;
  }

  if (marker.lensHead !== undefined) {
    return marker.lensHead;
  }

  return marker.checked === undefined && marker.failedCalls === 0 ? marker.head : null;
}
