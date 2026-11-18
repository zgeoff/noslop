import { expect, test } from 'bun:test';
import { PID_NAMESPACE_LINK, readPIDNamespace } from './read-pid-namespace';
import { readTempPrefix } from './read-temp-prefix';

test("it names the test process's PID and its PID namespace", () => {
  expect(readTempPrefix()).toBe(`pid${process.pid}-ns${readPIDNamespace(PID_NAMESPACE_LINK)}-`);
});
