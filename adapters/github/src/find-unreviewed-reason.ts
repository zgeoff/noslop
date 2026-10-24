import { findChangedPaths } from './find-changed-paths';
import type { NetChangeKey } from './net-change-key';
import type { SummaryMarker } from './summary-marker';

export interface ReviewedInput {
  summary: SummaryMarker | null;
  currentHead: string;

  currentKey: NetChangeKey;
}

const NAMED_FILES = 5;

export function findUnreviewedReason(input: ReviewedInput): string | null {
  const summary = input.summary;
  const missing = `No noslop review for this commit, ${input.currentHead.slice(0, 12)}.`;

  if (summary === null) {
    return missing;
  }

  const changed = findChangedPaths(summary, input.currentHead, input.currentKey);

  if (changed === null) {
    return missing;
  }

  if (changed.length === 0) {
    return null;
  }

  const named = changed.slice(0, NAMED_FILES).join(', ');
  const more = changed.length > NAMED_FILES ? ` and ${changed.length - NAMED_FILES} more` : '';

  return `No noslop review of this change to ${named}${more}: the patch changed since the review of ${summary.head.slice(0, 12)}.`;
}
