import { isAbsolute, relative } from 'node:path';
import type { Severity } from '@noslop/contract';
import type { ReportedFinding } from '@noslop/eval';

// one finding of `codex review`: `- [P1] Title — /abs/path:12-14`, its body on the indented lines below
const FINDING_LINE =
  /^- \[P(?<priority>[0-3])\] (?<title>.+?) — (?<path>.+):(?<start>\d+)(?:-(?<end>\d+))?$/u;

// reads the findings out of the review text, with each path made relative to the reviewed worktree; a
// P0 counts as P1, because noslop's scale has no level above P1
export function parseCodexReview(text: string, worktree: string): ReportedFinding[] {
  const findings: ReportedFinding[] = [];

  for (const line of text.split('\n')) {
    const match = FINDING_LINE.exec(line.trim());

    if (match?.groups === undefined) {
      continue;
    }

    const groups = match.groups;
    const path = groups['path'] ?? '';
    const startLine = Number(groups['start']);
    const end = groups['end'];

    findings.push({
      lens: null,
      title: groups['title'] ?? '',
      severity: toSeverity(Number(groups['priority'])),
      anchor: {
        path: isAbsolute(path) ? relative(worktree, path) : path,
        startLine,
        endLine: end === undefined ? startLine : Number(end),
      },
    });
  }

  return findings;
}

function toSeverity(priority: number): Severity {
  if (priority <= 1) {
    return 'P1';
  }

  return priority === 2 ? 'P2' : 'P3';
}
