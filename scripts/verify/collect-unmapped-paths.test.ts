import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { $ } from 'bun';
import { collectUnmappedPaths } from './collect-unmapped-paths.ts';
import { featurePaths, ignoredPaths, sharedPaths } from './feature-paths.ts';

test('it collects the paths that no glob matches', () => {
  const paths = ['apps/orchard/src/cli.ts', 'docs/orchard.md', 'tools/prune.sh'];

  expect(collectUnmappedPaths(paths, ['apps/orchard/**', 'docs/**'])).toStrictEqual([
    'tools/prune.sh',
  ]);
});

test('it maps every tracked file of the repo to a feature, a shared glob or an ignore glob', async () => {
  const root = join(import.meta.dir, '..', '..');

  const tracked = await $`git ls-files`.cwd(root).text();

  const globs = [...Object.values(featurePaths).flat(), ...sharedPaths, ...ignoredPaths];

  expect(collectUnmappedPaths(tracked.trim().split('\n'), globs)).toStrictEqual([]);
});
