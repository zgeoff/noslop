import type { SummaryMarker } from './summary-marker';

export function findLensHead(marker: SummaryMarker | null): string | null {
  if (marker === null) {
    return null;
  }

  if (marker.lensHead !== undefined) {
    return marker.lensHead;
  }

  return marker.checked === undefined && marker.failedCalls === 0 ? marker.head : null;
}
