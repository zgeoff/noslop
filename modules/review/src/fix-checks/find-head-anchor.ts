import type { LaterHunk } from './read-later-hunks';

export interface LineSpan {
  startLine: number;
  endLine: number;
}

export function findHeadAnchor<Span extends LineSpan>(
  hunks: readonly LaterHunk[],
  anchor: Span,
): Span | null {
  let shift = 0;

  for (const hunk of hunks) {
    // a hunk that only adds lines adds them after its old start
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
