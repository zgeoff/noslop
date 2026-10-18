// one file a commit changes, as GitHub lists it; a rename names the path it had before
export interface CommitFile {
  filename: string;
  previous_filename?: string;
}

// whether a fix commit touches a file the review left out, by its path after the commit or before a
// rename, since a rename moves the fix into or out of a file the review did not read
export function hasSkippedFile(
  files: readonly CommitFile[],
  skipped: ReadonlySet<string>,
): boolean {
  return files.some(
    (file) =>
      skipped.has(file.filename) ||
      (file.previous_filename !== undefined && skipped.has(file.previous_filename)),
  );
}
