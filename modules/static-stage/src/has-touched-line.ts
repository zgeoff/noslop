import type { ChangedLines } from './build-changed-lines';

export function hasTouchedLine(lines: ChangedLines, startLine: number, endLine: number): boolean {
  for (const line of lines.touched) {
    if (line >= startLine && line <= endLine) {
      return true;
    }
  }

  return false;
}
