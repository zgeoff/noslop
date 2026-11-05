import { expect, test } from 'bun:test';
import { PID_NAMESPACE_LINK, readPIDNamespace } from './read-pid-namespace';
import { readTempPrefix } from './read-temp-prefix';

test("it names the test process's PID and the namespace of the system's link", () => {
  expect(readTempPrefix()).toBe(`pid${process.pid}-ns${readPIDNamespace(PID_NAMESPACE_LINK)}-`);
});
