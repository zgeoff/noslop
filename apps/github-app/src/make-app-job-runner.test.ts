import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubRunner } from '@noslop/testing';
import { makeAppJobRunner } from './make-app-job-runner';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-app-job-runner-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it runs a review job through the noslop bin the cli dependency installs, not a cli source file', async () => {
  const ctx = await setupTest();

  const stub = buildStubRunner([
    { argv: ['git', 'clone'], result: {} },
    { argv: ['git', 'fetch'], result: {} },
    { argv: ['git', 'checkout'], result: {} },
    { argv: ['bun'], result: {} },
  ]);

  const runJob = makeAppJobRunner(
    {
      appID: 1,
      privateKey: 'app-key',
      webhookSecret: 'hook-secret',
      port: 3000,
      reposDir: ctx.dir,
    },
    { runner: stub.runner, mintToken: () => Promise.resolve('ghs_token') },
  );

  await runJob({ kind: 'review', owner: 'example', repo: 'app', number: 5, installationID: 7 });

  const appDir = join(import.meta.dir, '..');

  expect(stub.runs.at(-1)?.argv.slice(0, 4)).toStrictEqual([
    'bun',
    `--config=${join(appDir, '..', '..', 'bunfig.toml')}`,
    join(appDir, 'node_modules', '.bin', 'noslop'),
    'review',
  ]);
});
