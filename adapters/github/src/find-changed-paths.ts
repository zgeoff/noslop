import { P, match } from 'ts-pattern';
import { collectChangedFiles } from './collect-changed-files';
import type { NetChangeKey } from './net-change-key';
import type { SummaryMarker } from './summary-marker';

// the paths whose patch changed since the reviews the summary keeps, or null when the 2 keys cannot be
// matched file by file; a key on the head, or none, as a marker written before the key has, matches
// only that head, with no path changed
export function findChangedPaths(
  summary: SummaryMarker,
  currentHead: string,
  currentKey: NetChangeKey,
): string[] | null {
  const stored = summary.key ?? { head: summary.head };

  return match([stored, currentKey])
    .with([{ files: P.select('before') }, { files: P.select('after') }], (keys) =>
      collectChangedFiles(keys.before, keys.after),
    )
    .with([{ head: P.string }, P._], [P._, { head: P.string }], () =>
      summary.head === currentHead ? [] : null,
    )
    .exhaustive();
}
