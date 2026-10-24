import type { DismissedFinding, Finding } from '@noslop/contract';
import type { DismissedFindingsSplit } from '@noslop/findings';
import { splitDismissedFindings } from '@noslop/findings';
import type { Runner } from '@noslop/runner';

export interface DismissedFindingsOptions {
  runner: Runner;
  repoDir: string;

  head: string;
  findings: readonly Finding[];

  dismissed: readonly DismissedFinding[];

  maxLines: number;
}

export async function readDismissedFindings(
  options: DismissedFindingsOptions,
): Promise<DismissedFindingsSplit> {
  if (options.dismissed.length === 0) {
    return { kept: [...options.findings], dismissed: [] };
  }

  const files = new Map<string, Promise<string[] | null>>();

  const readLines = (commit: string, path: string): Promise<string[] | null> => {
    const key = `${commit}:${path}`;
    const read = files.get(key) ?? readFileLines(options, commit, path);

    files.set(key, read);

    return read;
  };

  const quoted = await Promise.all(
    options.findings.map(async (finding) => {
      const lines = await readLines(options.head, finding.anchor.path);

      return {
        finding,
        code: toAnchorCode(lines, finding.anchor.startLine, finding.anchor.endLine),
      };
    }),
  );

  const dismissed = await Promise.all(
    options.dismissed.map(async (finding) => {
      if (finding.head === null || finding.startLine === null || finding.endLine === null) {
        return { finding, code: null };
      }

      const lines = await readLines(finding.head, finding.path);

      return { finding, code: toAnchorCode(lines, finding.startLine, finding.endLine) };
    }),
  );

  return splitDismissedFindings({ findings: quoted, dismissed, maxLines: options.maxLines });
}

async function readFileLines(
  options: DismissedFindingsOptions,
  commit: string,
  path: string,
): Promise<string[] | null> {
  const result = await options.runner.run(['git', 'show', `${commit}:${path}`], {
    cwd: options.repoDir,
  });

  return result.exitCode === 0 ? result.stdout.split('\n') : null;
}

function toAnchorCode(lines: string[] | null, startLine: number, endLine: number): string | null {
  return lines === null ? null : lines.slice(startLine - 1, endLine).join('\n');
}
