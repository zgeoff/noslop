import { expect, test } from 'bun:test';
import { readTempPrefix } from './read-temp-prefix';

test("it starts with the test process's PID and a PID namespace", () => {
  expect(readTempPrefix()).toMatch(new RegExp(`^pid${process.pid}-ns(\\d+|none)-$`, 'u'));
});
