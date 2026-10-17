import { resolveFilePath } from './resolve-file-path';
import type { CaseRun } from './types';

// the runs with each reported path resolved to its file at its case's head, the same way the labels
// resolve, so a recorded run whose paths match the corpus's own keeps matching; a run of a case with
// no files listed stays as it is
export function resolveRunPaths(
  runs: readonly CaseRun[],
  filesByCase: ReadonlyMap<string, readonly string[]>,
): CaseRun[] {
  return runs.map((run) => {
    const files = filesByCase.get(run.caseID) ?? [];

    return {
      ...run,
      review: {
        ...run.review,
        findings: run.review.findings.map((finding) => ({
          ...finding,
          anchor: { ...finding.anchor, path: resolveFilePath(finding.anchor.path, files) },
        })),
      },
    };
  });
}
