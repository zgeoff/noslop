import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';
import { planReview } from './plan-review';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-plan-review-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, runner: createRunner() };
}

test('it plans the depth and the calls of a change with no model call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/auth/session.ts': 'export const ttl = 60;\n' } },
    { message: 'head', files: { 'src/auth/session.ts': 'export const ttl = 6000;\n' } },
  ]);

  const plan = await planReview({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: BUILT_IN_DEFAULTS,
    cacheDir: null,
    title: 'Lengthen the session',
    body: '',
    linkedIssue: null,
    isPush: false,
    pastEscapes: [],
  });

  expect([
    plan.route.depth,
    plan.stage.signals.riskClasses,
    plan.route.calls.map((call) => call.callID),
  ]).toStrictEqual(['deep', ['auth'], ['A', 'B']]);
});
