import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPIDNamespace } from './read-pid-namespace';
import { readTempPrefix } from './read-temp-prefix';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-namespace-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it gives the inode that a PID namespace link names', async () => {
  const ctx = await setupTest();

  const link = join(ctx.directory, 'pid');

  await symlink('pid:[4026531836]', link);

  expect(readPIDNamespace(link)).toBe('4026531836');
});

test('it gives none on a system with no PID namespace link', async () => {
  const ctx = await setupTest();

  expect(readPIDNamespace(join(ctx.directory, 'missing'))).toBe('none');
});

test('it throws when the path exists but is no link', async () => {
  const ctx = await setupTest();

  expect(() => readPIDNamespace(ctx.directory)).toThrow();
});
