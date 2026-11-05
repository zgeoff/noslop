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

test("it removes the folders of a finished run in the sweep's own namespace", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'pid111-ns5-noslop-store-a1'));
  await runTempSweep({ root: ctx.root, namespace: '5', isRunning: () => false });

  const left = await readdir(ctx.root);

  expect(left).toStrictEqual([]);
});

test('it never removes the folders of a run that is still going', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'pid222-ns5-noslop-store-b2'));
  await runTempSweep({ root: ctx.root, namespace: '5', isRunning: () => true });

  const left = await readdir(ctx.root);

  expect(left).toStrictEqual(['pid222-ns5-noslop-store-b2']);
});

test('it never touches a folder of another namespace or one with no run prefix', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'pid111-ns6-noslop-store-c3'));
  await mkdir(join(ctx.root, 'noslop-store-d4'));
  await runTempSweep({ root: ctx.root, namespace: '5', isRunning: () => false });

  const left = await readdir(ctx.root);

  expect(left).toIncludeSameMembers(['pid111-ns6-noslop-store-c3', 'noslop-store-d4']);
});
