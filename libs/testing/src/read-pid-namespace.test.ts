import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PID_NAMESPACE_LINK, readPIDNamespace } from './read-pid-namespace';
import { readTempPrefix } from './read-temp-prefix';

test("it gives the inode of the test process's PID namespace", async () => {
  const link = await readlink('/proc/self/ns/pid');

  expect(`pid:[${readPIDNamespace(PID_NAMESPACE_LINK)}]`).toBe(link);
});

test('it gives none on a system with no PID namespace link', async () => {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-namespace-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  expect(readPIDNamespace(join(directory, 'missing'))).toBe('none');
});

test('it throws when the link exists but is no link', async () => {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-namespace-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  expect(() => readPIDNamespace(directory)).toThrow();
});
