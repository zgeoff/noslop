import type { ChangedFile } from './types';

export interface ChangedLines {
  // the head lines the change added or rewrote
  added: Set<number>;

  // the added lines, plus the head line at which each deleted line sat, so a unit that only lost
  // lines still counts as changed
  touched: Set<number>;
}

export function buildChangedLines(file: ChangedFile): ChangedLines {
  const added = new Set<number>();
  const touched = new Set<number>();

  for (const hunk of file.hunks) {
    const lastLine = hunk.newStart + Math.max(hunk.newLines, 1) - 1;
    let cursor = hunk.newStart;

    for (const line of hunk.lines) {
      if (line.newLine !== null) {
        cursor = line.newLine + 1;
      }

      if (line.kind === 'added' && line.newLine !== null) {
        added.add(line.newLine);
        touched.add(line.newLine);
      } else if (line.kind === 'deleted') {
        touched.add(Math.max(1, Math.min(cursor, lastLine)));
      }
    }
  }

  return { added, touched };
}
