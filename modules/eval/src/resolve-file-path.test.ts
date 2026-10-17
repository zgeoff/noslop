import { expect, test } from 'bun:test';
import { resolveFilePath } from './resolve-file-path';

test.each([
  ['a path that names a file', 'src/main.ts', 'src/main.ts'],
  ['a path with a checkout prefix', 'checkout/src/lanes.ts', 'src/lanes.ts'],
  ['a path that leaves out a leading folder', 'client/picker.ts', 'src/client/picker.ts'],
  ['a path that 2 files end with', 'index.ts', 'index.ts'],
  ['a path that names no file', 'gone/old.ts', 'gone/old.ts'],
])('it resolves %s', (_label, path, expected) => {
  expect(
    resolveFilePath(path, [
      'lanes.ts',
      'src/lanes.ts',
      'src/client/picker.ts',
      'src/main.ts',
      'src/index.ts',
      'web/index.ts',
    ]),
  ).toBe(expected);
});
