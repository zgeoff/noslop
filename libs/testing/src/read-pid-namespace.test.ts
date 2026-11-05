import { expect, test } from 'bun:test';
import { readlink } from 'node:fs/promises';
import { readPIDNamespace } from './read-pid-namespace';

test("it gives the inode of the test process's PID namespace", async () => {
  const link = await readlink('/proc/self/ns/pid');

  expect(`pid:[${readPIDNamespace()}]`).toBe(link);
});
