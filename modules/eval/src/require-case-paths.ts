import type { Case } from './case';
import { normalizePath } from './normalize-path';

// throws when a labelled path names no file at the case's head, because a label on a missing file can
// never match and would score as a miss; a case whose head files could not be read is left to the
// replay, which records it as failed
export function requireCasePaths(corpusCase: Case, files: readonly string[]): void {
  if (files.length === 0) {
    return;
  }

  const known = new Set(files);

  const anchors = [
    ...corpusCase.findings.map((finding) => finding.anchor),
    ...corpusCase.escapes.flatMap((escape) => (escape.anchor === undefined ? [] : [escape.anchor])),
  ];

  const missing = anchors
    .map((anchor) => anchor.path)
    .filter((path) => !known.has(normalizePath(path)));

  if (missing.length > 0) {
    throw new Error(
      `case ${corpusCase.id} labels paths that name no file at its head: ${[...new Set(missing)].join(', ')}`,
    );
  }
}
