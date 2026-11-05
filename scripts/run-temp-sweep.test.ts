import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/testing';
import { runTempSweep } from './run-temp-sweep';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-sweep-`));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  return { root };
}

test('it removes the folders it picks and keeps the rest', async () => {
  const ctx = await setupTest();

  const running = new Map([[222, true]]);

  await mkdir(join(ctx.root, 'pid111-ns5-noslop-store-a1'));
  await mkdir(join(ctx.root, 'pid222-ns5-noslop-store-b2'));
  await mkdir(join(ctx.root, 'noslop-store-c3'));

  await runTempSweep({
    root: ctx.root,
    namespace: '5',
    isRunning: (pid) => running.get(pid) ?? false,
  });

  const left = await readdir(ctx.root);

  expect(left).toIncludeSameMembers(['pid222-ns5-noslop-store-b2', 'noslop-store-c3']);
});
