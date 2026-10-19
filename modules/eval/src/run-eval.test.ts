import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';
import type { Case } from './case';
import { runEval } from './run-eval';
import type { CaseReview } from './types';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-run-eval-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, workDir: join(directory, 'work'), runner: createRunner() };
}

test('it reviews each case in a detached worktree of its head and removes the worktree', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'a.ts': 'export const a = 2;\n' } },
  ]);

  const corpusCase: Case = {
    id: 'case-1',
    repo: repo.path,
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    title: 'feat: head',
    body: '',
    findings: [],
    escapes: [],
  };

  const review: CaseReview = {
    findings: [],
    failed: false,
    tokens: { input: 10, cachedInput: 50, cacheWrite: 0, output: 2 },
    durationMs: 5,
    calls: 1,
    depth: 'standard',
  };

  const reviewCase = mock(() => Promise.resolve(review));

  const runs = await runEval({
    cases: [corpusCase],
    reviewer: { id: 'stub', reviewCase },
    runner: ctx.runner,
    workDir: ctx.workDir,
    parallel: 1,
  });

  expect(runs).toStrictEqual([{ caseID: 'case-1', review }]);
  expect(reviewCase).toHaveBeenCalledExactlyOnceWith(corpusCase, join(ctx.workDir, 'case-1-stub'));

  const left = await Bun.file(join(ctx.workDir, 'case-1-stub', '.git')).exists();

  expect(left).toBe(false);
});

test('it replays cases at once and keeps their order when a later case ends first', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'a.ts': 'export const a = 2;\n' } },
  ]);

  const review: CaseReview = {
    findings: [],
    failed: false,
    tokens: { input: 10, cachedInput: 50, cacheWrite: 0, output: 2 },
    durationMs: 5,
    calls: 1,
    depth: 'standard',
  };

  // case-1 waits until a case has ended, so case-2 always ends first
  const firstEnd = Promise.withResolvers<null>();

  const waits: Record<string, Promise<null>> = {
    'case-1': firstEnd.promise,
    'case-2': Promise.resolve(null),
  };

  const ended: string[] = [];

  const runs = await runEval({
    cases: [
      {
        id: 'case-1',
        repo: repo.path,
        base: repo.commits[0] ?? '',
        head: repo.commits[1] ?? '',
        title: 'feat: head',
        body: '',
        findings: [],
        escapes: [],
      },
      {
        id: 'case-2',
        repo: repo.path,
        base: repo.commits[0] ?? '',
        head: repo.commits[1] ?? '',
        title: 'feat: head',
        body: '',
        findings: [],
        escapes: [],
      },
    ],
    reviewer: {
      id: 'stub',
      reviewCase: async (corpusCase) => {
        await waits[corpusCase.id];

        return review;
      },
    },
    runner: ctx.runner,
    workDir: ctx.workDir,
    parallel: 2,
    onCase: (run) => {
      ended.push(run.caseID);
      firstEnd.resolve(null);
    },
  });

  expect(ended).toStrictEqual(['case-2', 'case-1']);
  expect(runs.map((run) => run.caseID)).toStrictEqual(['case-1', 'case-2']);
});

test('it hands a reviewer that checks out the head itself the repo and adds no worktree', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'a.ts': 'export const a = 2;\n' } },
  ]);

  const corpusCase: Case = {
    id: 'case-1',
    repo: repo.path,
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    title: 'feat: head',
    body: '',
    findings: [],
    escapes: [],
  };

  const reviewCase = mock(() =>
    Promise.resolve({
      findings: [],
      failed: false,
      tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
      durationMs: 1,
      calls: 1,
      depth: 'light' as const,
    }),
  );

  await runEval({
    cases: [corpusCase],
    reviewer: { id: 'self', needsWorktree: false, reviewCase },
    runner: ctx.runner,
    workDir: ctx.workDir,
    parallel: 1,
  });

  const made = await Bun.file(join(ctx.workDir, 'case-1-self', '.git')).exists();

  expect(reviewCase).toHaveBeenCalledExactlyOnceWith(corpusCase, repo.path);
  expect(made).toBe(false);
});

test('it records a failed review and reports it when the repo does not exist', async () => {
  const ctx = await setupTest();

  const onCase = mock(() => {});

  const runs = await runEval({
    cases: [
      {
        id: 'case-1',
        repo: join(ctx.directory, 'missing'),
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'feat: gone',
        body: '',
        findings: [],
        escapes: [],
      },
    ],
    reviewer: { id: 'stub', reviewCase: mock() },
    runner: ctx.runner,
    workDir: ctx.workDir,
    parallel: 1,
    onCase,
  });

  expect(runs.map((run) => run.review.failed)).toStrictEqual([true]);
  expect(onCase).toHaveBeenCalledExactlyOnceWith(runs[0]);
});

test('it records a failed review when the head is not in the repo', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'a.ts': 'export const a = 1;\n' } },
  ]);

  const runs = await runEval({
    cases: [
      {
        id: 'case-1',
        repo: repo.path,
        base: repo.commits[0] ?? '',
        head: 'f'.repeat(40),
        title: 'feat: gone',
        body: '',
        findings: [],
        escapes: [],
      },
    ],
    reviewer: { id: 'stub', reviewCase: mock() },
    runner: ctx.runner,
    workDir: ctx.workDir,
    parallel: 1,
  });

  expect(runs).toStrictEqual([
    {
      caseID: 'case-1',
      review: {
        findings: [],
        failed: true,
        tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
        durationMs: 0,
        calls: 0,
        depth: null,
      },
    },
  ]);
});
