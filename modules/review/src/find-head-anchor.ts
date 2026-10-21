import type { LaterHunk } from './read-later-hunks';

export interface LineSpan {
  startLine: number;
  endLine: number;
}

// the span's lines after the hunks, shifted by each hunk above them; null when a hunk changes a line
// of the span or adds a line inside it; a hunk that adds lines only, with no old line, adds them after
// its start line
export function findHeadAnchor<Span extends LineSpan>(
  hunks: readonly LaterHunk[],
  anchor: Span,
): Span | null {
  let shift = 0;

  for (const hunk of hunks) {
    const oldEnd = hunk.oldLines === 0 ? hunk.oldStart : hunk.oldStart + hunk.oldLines - 1;
    const isAbove = oldEnd < anchor.startLine;

    const isBelow =
      hunk.oldLines === 0 ? hunk.oldStart >= anchor.endLine : hunk.oldStart > anchor.endLine;

    if (isAbove) {
      shift += hunk.newLines - hunk.oldLines;
    } else if (!isBelow) {
      return null;
    }
  }

  return { ...anchor, startLine: anchor.startLine + shift, endLine: anchor.endLine + shift };
}
