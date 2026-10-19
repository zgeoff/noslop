import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { createRunner } from '@noslop/runner';
import { buildStubAdapter, createTestRepo } from '@noslop/testing';
import { runFixesOnlyReview } from './run-fixes-only-review';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-fixes-only-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, runner: createRunner(), logger: getLogger(['test']) };
}

test('it lists the verdict of each fix check and raises no finding', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
  ]);

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
  });

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 1,
        comment: 'An empty separator splits the line into single characters.',
        commit: (repo.commits[1] ?? '').slice(0, 7),
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(result.fixChecks).toStrictEqual([
    { findingID: '1111111111111111', fixed: true, reason: 'The separator is a colon now.' },
  ]);

  expect(result.findings).toStrictEqual([]);
  expect(result.lenses).toStrictEqual([]);
  expect(result.failedCalls).toStrictEqual([]);
});

test('it gives the call the numbered code around the anchored line at the reviewed head and the diff of the file', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n',
        'src/other.ts': 'export const other = 1;\n',
      },
    },
    {
      message: 'Reject an empty separator',
      files: {
        'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n',
        'src/other.ts': 'export const other = 2;\n',
      },
    },
  ]);

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
  });

  await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 2,
        comment: 'An empty separator splits the line into single characters.',
        commit: (repo.commits[1] ?? '').slice(0, 7),
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude(
    '```text\n1: export const zero = 0;\n2: export const separator = "";\n```',
  );

  expect(stub.requests[0]?.prompt).toInclude(
    '-export const separator = "";\n+export const separator = ":";',
  );

  expect(stub.requests[0]?.prompt).not.toInclude('src/other.ts');
});

test('it lists no verdict and records the failed call when the call fails', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
  ]);

  const stub = buildStubAdapter({ 'fix-1111111111111111': [{ error: 'the model timed out' }] });

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 1,
        comment: 'An empty separator splits the line into single characters.',
        commit: (repo.commits[1] ?? '').slice(0, 7),
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(result.fixChecks).toStrictEqual([]);

  expect(result.failedCalls).toStrictEqual([
    { id: 'fix-1111111111111111', lenses: ['correctness'], reason: 'the model timed out' },
  ]);
});

test('it asks nothing about a fix whose commit came before the reviewed head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
    { message: 'Add a tab', files: { 'src/tab.ts': 'export const tab = "\\t";\n' } },
  ]);

  const stub = buildStubAdapter({});

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 1,
        comment: 'An empty separator splits the line into single characters.',
        commit: (repo.commits[1] ?? '').slice(0, 7),
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests).toStrictEqual([]);
  expect(result.fixChecks).toStrictEqual([]);
});

test('it asks nothing about a fix whose diff passes the file limit and names the file as too large', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
  ]);

  const stub = buildStubAdapter({});

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 1,
        comment: 'An empty separator splits the line into single characters.',
        commit: (repo.commits[1] ?? '').slice(0, 7),
      },
    ],
    maxFileChars: 40,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests).toStrictEqual([]);
  expect(result.fixChecks).toStrictEqual([]);
  expect(result.notReviewed).toStrictEqual([{ path: 'src/scan.ts', reason: 'too-large' }]);
});

test('it judges the fix of a static finding not fixed with no call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
  ]);

  const stub = buildStubAdapter({});

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Remove the debugger statement',
        lens: 'static',
        path: 'src/scan.ts',
        line: 1,
        comment: 'A debugger statement stops the program in a browser.',
        commit: (repo.commits[1] ?? '').slice(0, 7),
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests).toStrictEqual([]);

  expect(result.fixChecks).toStrictEqual([
    {
      findingID: '1111111111111111',
      fixed: false,
      reason: 'a static finding takes a full review to confirm its fix',
    },
  ]);
});
