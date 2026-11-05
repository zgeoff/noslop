import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PID_NAMESPACE_LINK, readPIDNamespace } from '@noslop/testing';
import { collectTempLeftovers } from './collect-temp-leftovers';
import { pickTempLeftovers } from './pick-temp-leftovers';
import { probeProcessRuns } from './probe-process-runs';

export interface TempSweep {
  root: string;
  namespace: string;
  isRunning: (pid: number) => boolean;
}

export async function runTempSweep(sweep: TempSweep): Promise<string[]> {
  const names = await readdir(sweep.root);

  const running = new Map(
    collectTempLeftovers(names, sweep.namespace).map((leftover) => [
      leftover.pid,
      sweep.isRunning(leftover.pid),
    ]),
  );

  const removed = pickTempLeftovers(names, sweep.namespace, running);

  await Promise.all(
    removed.map((name) => rm(join(sweep.root, name), { recursive: true, force: true })),
  );

  return removed;
}

if (import.meta.main) {
  const removed = await runTempSweep({
    root: tmpdir(),
    namespace: readPIDNamespace(PID_NAMESPACE_LINK),
    isRunning: probeProcessRuns,
  });

  if (removed.length > 0) {
    process.stdout.write(`temp sweep: removed ${removed.length} folders of finished test runs\n`);
  }
}
