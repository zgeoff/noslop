import { expect, test } from 'bun:test';
import { buildFindingID } from './build-finding-id';

test('it gives one defect the same ID when its title names a moved line', () => {
  expect(buildFindingID('correctness', 'src/a.ts', 'data-loss', 'Fix the write at line 12')).toBe(
    buildFindingID('correctness', 'src/a.ts', 'data-loss', 'Fix the write at line 40.'),
  );
});

test('it gives findings of different lenses different IDs', () => {
  expect(buildFindingID('correctness', 'src/a.ts', 'data-loss', 'Fix the write')).not.toBe(
    buildFindingID('security', 'src/a.ts', 'data-loss', 'Fix the write'),
  );
});
