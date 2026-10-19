import type { CommitFile } from './has-skipped-file';

// GitHub's entry for a changed file holds more fields than the fix checks read
export function toCommitFile(file: CommitFile): CommitFile {
  return file.previous_filename === undefined
    ? { filename: file.filename }
    : { filename: file.filename, previous_filename: file.previous_filename };
}
