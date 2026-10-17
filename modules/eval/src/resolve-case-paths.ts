import type { Case } from './case';
import { resolveFilePath } from './resolve-file-path';

// the case with each labelled path resolved to its file at the case's head
export function resolveCasePaths(corpusCase: Case, files: readonly string[]): Case {
  return {
    ...corpusCase,
    findings: corpusCase.findings.map((finding) => ({
      ...finding,
      anchor: { ...finding.anchor, path: resolveFilePath(finding.anchor.path, files) },
    })),
    escapes: corpusCase.escapes.map((escape) =>
      escape.anchor === undefined
        ? escape
        : {
            ...escape,
            anchor: { ...escape.anchor, path: resolveFilePath(escape.anchor.path, files) },
          },
    ),
  };
}
