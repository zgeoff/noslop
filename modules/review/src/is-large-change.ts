import type { Change, Thresholds } from '@noslop/contract';

// a change with at least the config's count of files or of changed lines, the size that a gap sweep
// needs before it runs
export function isLargeChange(change: Change, thresholds: Thresholds): boolean {
  const lines = change.files.reduce(
    (total, file) => total + file.addedLines + file.deletedLines,
    0,
  );

  return change.files.length >= thresholds.gapSweepMinFiles || lines >= thresholds.gapSweepMinLines;
}
