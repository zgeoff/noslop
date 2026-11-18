import { expect, test } from 'bun:test';
import { collectRangeFiles } from './collect-range-files';

test('it lists each file the range touches once', () => {
  const range = [
    { files: ['README.md', 'src/app.ts'], renames: {} },
    { files: ['src/app.ts'], renames: {} },
  ];

  expect(collectRangeFiles(range)).toStrictEqual([
    { filename: 'README.md' },
    { filename: 'src/app.ts' },
  ]);
});

test('it reports a file renamed twice under its name before the range', () => {
  const range = [
    { files: ['src/utils.ts'], renames: { 'src/utils.ts': 'src/helpers.ts' } },
    { files: ['src/tools.ts'], renames: { 'src/tools.ts': 'src/utils.ts' } },
  ];

  expect(collectRangeFiles(range)).toStrictEqual([
    { filename: 'src/tools.ts', status: 'renamed', previous_filename: 'src/helpers.ts' },
  ]);
});

test('it lists no files for an empty range', () => {
  expect(collectRangeFiles([])).toStrictEqual([]);
});
