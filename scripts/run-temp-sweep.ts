import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PID_NAMESPACE_LINK, readPIDNamespace } from '@noslop/testing';
import { collectTempLeftovers } from './collect-temp-leftovers';
import { pickTempLeftovers } from './pick-temp-leftovers';
import { probeProcessRuns } from './probe-process-runs';

export interface TempSweep {
  namespace: string;
  readNames: () => Promise<string[]>;
  isRunning: (pid: number) => boolean;
  removeName: (name: string) => Promise<void>;
}

export async function runTempSweep(sweep: TempSweep): Promise<string[]> {
  const names = await sweep.readNames();

  const running = new Map(
    collectTempLeftovers(names, sweep.namespace).map((leftover) => [
      leftover.pid,
      sweep.isRunning(leftover.pid),
    ]),
  );

  const removed = pickTempLeftovers(names, sweep.namespace, running);

  await Promise.all(removed.map((name) => sweep.removeName(name)));

  return removed;
}

if (import.meta.main) {
  const root = tmpdir();

  const removed = await runTempSweep({
    namespace: readPIDNamespace(PID_NAMESPACE_LINK),
    readNames: () => readdir(root),
    isRunning: probeProcessRuns,
    removeName: (name) => rm(join(root, name), { recursive: true, force: true }),
  });

  if (removed.length > 0) {
    process.stdout.write(`temp sweep: removed ${removed.length} folders of finished test runs\n`);
  }
}
