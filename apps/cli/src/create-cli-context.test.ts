import { expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createCLIContext } from './create-cli-context';

test('it keeps the store under the home folder when XDG_DATA_HOME is empty', () => {
  const ctx = createCLIContext({ XDG_DATA_HOME: '', XDG_CACHE_HOME: 'relative/cache' });

  expect([ctx.dataDir, ctx.cacheDir]).toStrictEqual([
    join(homedir(), '.local', 'share', 'noslop'),
    join(homedir(), '.cache', 'noslop'),
  ]);
});

test('it puts the store and the cache under the XDG folders the environment sets', () => {
  const ctx = createCLIContext({ XDG_DATA_HOME: '/srv/data', XDG_CACHE_HOME: '/srv/cache' });

  expect([ctx.dataDir, ctx.cacheDir]).toStrictEqual(['/srv/data/noslop', '/srv/cache/noslop']);
});
