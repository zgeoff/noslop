import { P, match } from 'ts-pattern';
import { collectChangedFiles } from './collect-changed-files';
import type { NetChangeKey } from './net-change-key';
import type { SummaryMarker } from './summary-marker';

export interface ReviewedInput {
  summary: SummaryMarker | null;
  currentHead: string;

  // the key of the pull request's net change at the current head
  currentKey: NetChangeKey;
}

// the most changed files the check names
const NAMED_FILES = 5;

// a marker with a key counts for each head with the same net change; a key on the head, or none, as
// a marker written before the key has, counts only for that head
export function findUnreviewedReason(input: ReviewedInput): string | null {
  const summary = input.summary;
  const missing = `No noslop review for this commit, ${input.currentHead.slice(0, 12)}.`;

  if (summary === null) {
    return missing;
  }

  const stored = summary.key ?? { head: summary.head };

  const changed = match([stored, input.currentKey])
    .with([{ files: P.select('before') }, { files: P.select('after') }], (keys) =>
      collectChangedFiles(keys.before, keys.after),
    )
    .with([{ head: P.string }, P._], [P._, { head: P.string }], () => null)
    .exhaustive();

  if (changed === null) {
    return summary.head === input.currentHead ? null : missing;
  }

  if (changed.length === 0) {
    return null;
  }

  const named = changed.slice(0, NAMED_FILES).join(', ');
  const more = changed.length > NAMED_FILES ? ` and ${changed.length - NAMED_FILES} more` : '';

  return `No noslop review of this change to ${named}${more}: the patch changed since the review of ${summary.head.slice(0, 12)}.`;
}
