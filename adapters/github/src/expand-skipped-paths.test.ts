import { expect, test } from 'bun:test';
import { expandSkippedPaths } from './expand-skipped-paths';

test('it adds the path a skipped file had before a rename over the range', () => {
  expect(
    expandSkippedPaths(new Set(['samples/table.ts']), [
      { filename: 'samples/table.ts', previous_filename: 'src/table.ts' },
      { filename: 'src/b.ts', previous_filename: 'src/a.ts' },
    ]),
  ).toStrictEqual(new Set(['samples/table.ts', 'src/table.ts']));
});

test('it keeps the skipped paths alone when the range renames none of them', () => {
  expect(
    expandSkippedPaths(new Set(['samples/table.ts']), [{ filename: 'src/a.ts' }]),
  ).toStrictEqual(new Set(['samples/table.ts']));
});
