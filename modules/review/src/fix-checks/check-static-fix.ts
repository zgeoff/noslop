import type { Finding, FixCheck } from '@noslop/contract';
import type { Runner } from '@noslop/runner';

export interface StaticFixCheckInput {
  runner: Runner;
  repoDir: string;
  head: string;

  findingID: string;
  title: string;
  path: string;
  line: number | null;
  postedHead: string | null;

  findings: readonly Finding[];
}

export async function checkStaticFix(input: StaticFixCheckInput): Promise<FixCheck> {
  const same = input.findings.filter(
    (finding) => finding.anchor.path === input.path && finding.title === input.title,
  );

  if (same.length === 0) {
    return {
      findingID: input.findingID,
      fixed: true,
      reason: 'the static check no longer reports it at the head',
    };
  }

  const isReported = await probeReportedAtPlace(input, same);

  return isReported
    ? {
        findingID: input.findingID,
        fixed: false,
        reason: 'the static check still reports it at the head',
      }
    : {
        findingID: input.findingID,
        fixed: true,
        reason: 'the static check no longer reports it at the head',
      };
}

async function probeReportedAtPlace(
  input: StaticFixCheckInput,
  same: readonly Finding[],
): Promise<boolean> {
  if (input.line === null || input.postedHead === null) {
    return true;
  }

  const result = await input.runner.run(
    [
      'git',
      '--literal-pathspecs',
      'diff',
      '--no-ext-diff',
      '--no-renames',
      '--unified=0',
      input.postedHead,
      input.head,
      '--',
      input.path,
    ],
    { cwd: input.repoDir },
  );

  if (result.exitCode !== 0) {
    return true;
  }

  const lines = findHeadLines(result.stdout, input.line);

  return (
    lines !== null &&
    same.some(
      (finding) => finding.anchor.startLine <= lines.end && lines.start <= finding.anchor.endLine,
    )
  );
}

const HUNK_HEADER =
  /^@@ -(?<oldStart>\d+)(?:,(?<oldCount>\d+))? \+(?<newStart>\d+)(?:,(?<newCount>\d+))? @@/gmu;

function findHeadLines(diff: string, line: number): { start: number; end: number } | null {
  let offset = 0;

  for (const match of diff.matchAll(HUNK_HEADER)) {
    const oldStart = Number(match.groups?.['oldStart']);
    const oldCount = Number(match.groups?.['oldCount'] ?? 1);
    const newStart = Number(match.groups?.['newStart']);
    const newCount = Number(match.groups?.['newCount'] ?? 1);

    if (oldCount > 0 && oldStart <= line && line < oldStart + oldCount) {
      return newCount === 0 ? null : { start: newStart, end: newStart + newCount - 1 };
    }

    // a hunk that only adds lines adds them after its old start
    const oldEnd = oldCount === 0 ? oldStart : oldStart + oldCount - 1;

    if (oldEnd >= line) {
      break;
    }

    offset += newCount - oldCount;
  }

  return { start: line + offset, end: line + offset };
}
