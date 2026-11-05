import { expect, test } from 'bun:test';
import { probeProcessRuns } from './probe-process-runs';

test('it finds the test process running', () => {
  expect(probeProcessRuns(process.pid)).toBe(true);
});

test('it finds a process that has exited gone', () => {
  const exited = Bun.spawnSync(['true']);

  expect(probeProcessRuns(exited.pid)).toBe(false);
});

test('it counts the init process as running even when it may not be signalled', () => {
  expect(probeProcessRuns(1)).toBe(true);
});
