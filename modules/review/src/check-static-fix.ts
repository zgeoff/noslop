import type { Finding, FixCheck } from '@noslop/contract';
import type { Runner } from '@noslop/runner';

export interface StaticFixCheckInput {
  runner: Runner;
  repoDir: string;
  head: string;

  // the answered finding as its comment keeps it: the line it anchors to at the head that posted it
  findingID: string;
  title: string;
  path: string;
  line: number | null;
  postedHead: string | null;

  // the static findings of the whole pull request at the head
  findings: readonly Finding[];
}

// a static finding holds while the stage reports a finding with its title at its own place; the place
// decides, not the ID, since Assemble numbers 2 findings with one title by their order, so fixing the
// first hands its ID to the second
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

// whether a finding at the head sits on the lines that hold the posted line now; a finding with no
// posted line or head, or a diff git cannot read, counts as reported, since nothing tells it apart
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

// the head lines that hold a line of the posting head: the line itself, moved by the hunks above it,
// or the lines a hunk wrote in its place; null when a hunk deleted it and wrote nothing
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
