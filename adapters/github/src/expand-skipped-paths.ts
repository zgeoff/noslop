import type { CommitFile } from './has-skipped-file';

// the paths a review left out, and the path each of them had before a rename over the range, so a
// fix made before the rename still names a file the review did not read
export function expandSkippedPaths(
  skipped: ReadonlySet<string>,
  rangeFiles: readonly CommitFile[],
): Set<string> {
  const expanded = new Set(skipped);

  for (const file of rangeFiles) {
    if (file.previous_filename !== undefined && skipped.has(file.filename)) {
      expanded.add(file.previous_filename);
    }
  }

  return expanded;
}
