import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubRunner } from '@noslop/testing';
import { createCodexReviewReviewer } from './create-codex-review-reviewer';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-codex-review-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it runs codex review read-only against the case base in the worktree', async () => {
  const ctx = await setupTest();

  const stub = buildStubRunner([{ argv: ['codex', 'exec', 'review'], result: { exitCode: 0 } }]);

  const reviewer = createCodexReviewReviewer({
    runner: stub.runner,
    tempDir: ctx.dir,
    timeoutMs: 60_000,
  });

  await reviewer.reviewCase(
    {
      id: 'case-1',
      repo: '/repos/app',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      title: 'feat: add the queue',
      body: '',
      findings: [],
      escapes: [],
    },
    '/work/case-1',
  );

  expect(stub.runs).toStrictEqual([
    {
      argv: [
        'codex',
        'exec',
        'review',
        '--base',
        'a'.repeat(40),
        '--ephemeral',
        '-c',
        'sandbox_mode="read-only"',
        '-o',
        expect.toStartWith(join(ctx.dir, 'codex-review-')),
      ],
      options: { cwd: '/work/case-1', timeoutMs: 60_000 },
    },
  ]);
});

test('it records a failed review when codex writes no review', async () => {
  const ctx = await setupTest();

  const stub = buildStubRunner([{ argv: ['codex'], result: { exitCode: 1, durationMs: 40 } }]);

  const reviewer = createCodexReviewReviewer({
    runner: stub.runner,
    tempDir: ctx.dir,
    timeoutMs: 60_000,
  });

  const review = await reviewer.reviewCase(
    {
      id: 'case-1',
      repo: '/repos/app',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      title: 'feat: add the queue',
      body: '',
      findings: [],
      escapes: [],
    },
    '/work/case-1',
  );

  expect(review).toStrictEqual({
    findings: [],
    failed: true,
    tokens: { input: 0, output: 0 },
    durationMs: 40,
    calls: 1,
    depth: null,
  });
});
