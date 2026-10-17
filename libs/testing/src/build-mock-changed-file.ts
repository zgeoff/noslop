import type { ChangedFile } from '@noslop/contract';

// one modified code file with one added line, the smallest change routing reads
export function buildMockChangedFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path: 'src/a.ts',
    oldPath: 'src/a.ts',
    status: 'modified',
    binary: false,
    kind: 'code',
    hunks: [
      {
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ kind: 'added', text: 'export const a = 1;', oldLine: null, newLine: 1 }],
      },
    ],
    addedLines: 1,
    deletedLines: 0,
    ...overrides,
  };
}
