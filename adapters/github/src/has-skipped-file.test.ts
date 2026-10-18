import { expect, test } from 'bun:test';
import { hasSkippedFile } from './has-skipped-file';

test('it finds a skipped file among the files a commit changes', () => {
  expect(
    hasSkippedFile(
      [{ filename: 'src/a.ts' }, { filename: 'samples/corpus.jsonl' }],
      new Set(['samples/corpus.jsonl']),
    ),
  ).toBe(true);
});

test('it finds no skipped file in a commit that changes only reviewed files', () => {
  expect(hasSkippedFile([{ filename: 'src/a.ts' }], new Set(['samples/corpus.jsonl']))).toBe(false);
});

test('it finds a skipped file that a commit renames away', () => {
  expect(
    hasSkippedFile(
      [{ filename: 'src/table.ts', previous_filename: 'samples/table.ts' }],
      new Set(['samples/table.ts']),
    ),
  ).toBe(true);
});

test('it finds a skipped file that a commit renames a file into', () => {
  expect(
    hasSkippedFile(
      [{ filename: 'samples/table.ts', previous_filename: 'src/table.ts' }],
      new Set(['samples/table.ts']),
    ),
  ).toBe(true);
});
