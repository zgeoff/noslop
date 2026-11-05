import { expect, test } from 'bun:test';
import { readlink } from 'node:fs/promises';
import { readTempPrefix } from './read-temp-prefix';

test("it names the test process's PID and its PID namespace", async () => {
  const link = await readlink('/proc/self/ns/pid');

  const namespace = /^pid:\[(?<inode>\d+)\]$/u.exec(link)?.groups?.['inode'];

  expect(readTempPrefix()).toBe(`pid${process.pid}-ns${namespace}-`);
});
