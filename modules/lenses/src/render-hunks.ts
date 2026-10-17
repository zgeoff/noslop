import type { ChangedFile } from '@noslop/static-stage';

const NUMBER_WIDTH = 6;
const MARKERS = { added: '+', deleted: '-', context: ' ' } as const;

// renders each file's hunks with the head line number beside every line the head holds, so a lens
// anchors a finding to the numbers it reads; a deleted line has no head number
export function renderHunks(files: readonly ChangedFile[]): string {
  return files
    .map((file) => {
      const header =
        file.oldPath !== null && file.oldPath !== file.path
          ? `### ${file.path} (${file.status} from ${file.oldPath})`
          : `### ${file.path} (${file.status})`;

      if (file.binary) {
        return `${header}\n\nA binary file.`;
      }

      const hunks = file.hunks.map((hunk) => {
        const lines = hunk.lines.map((line) => {
          const number = line.newLine === null ? '' : String(line.newLine);
          const marker = MARKERS[line.kind];

          return `${number.padStart(NUMBER_WIDTH)} ${marker} ${line.text}`;
        });

        return [
          `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
          ...lines,
        ].join('\n');
      });

      return [header, '', '```diff', ...hunks, '```'].join('\n');
    })
    .join('\n\n');
}
