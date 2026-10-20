import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
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
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
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
        postedHead: null,
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

test("it gives the call the numbered code around the anchored line at the reviewed head and the diff of the fix commit's files", async () => {
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
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
    { message: 'Bump the other value', files: { 'src/other.ts': 'export const other = 2;\n' } },
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
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
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
        postedHead: null,
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

test("it judges a fix whose commit only adds a test in another file from that test's diff", async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = ":";\n' } },
    {
      message: 'Test the separator through the entry point',
      files: { 'src/scan.test.ts': 'test("it splits on a colon", () => {});\n' },
    },
  ]);

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'A test now covers the separator.' }],
  });

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Test the separator through the entry point',
        lens: 'tests',
        path: 'src/scan.ts',
        line: 1,
        comment: 'No test covers the separator through the entry point.',
        commit: (repo.commits[1] ?? '').slice(0, 7),
        postedHead: null,
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude('+test("it splits on a colon", () => {});');

  expect(result.fixChecks).toStrictEqual([
    { findingID: '1111111111111111', fixed: true, reason: 'A test now covers the separator.' },
  ]);
});

test("it gives the call the fix commit's whole patch when a later commit moves its code and its test to other files", async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: {
        'src/scan.ts': 'export const separator = ":";\n',
        'src/scan.test.ts': 'test("it splits on a colon", () => {});\n',
      },
    },
    {
      message: 'Give the separator its own module',
      files: {
        'src/scan.ts': "export { separator } from './separator';\n",
        'src/scan.test.ts': null,
        'src/separator.ts': 'export const separator = ":";\n',
        'src/separator.test.ts': 'test("it splits on a colon", () => {});\n',
      },
    },
  ]);

  const stub = buildStubAdapter({
    'fix-1111111111111111': [
      { fixed: true, reason: 'The separator is a colon, and a test checks it.' },
    ],
  });

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[0] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 1,
        comment:
          'An empty separator splits the line into single characters, and no test checks it.',
        commit: (repo.commits[1] ?? '').slice(0, 7),
        postedHead: null,
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude(
    '-export const separator = "";\n+export const separator = ":";',
  );

  expect(stub.requests[0]?.prompt).toInclude(
    '+++ b/src/scan.test.ts\n@@ -0,0 +1 @@\n+test("it splits on a colon", () => {});',
  );

  expect(result.fixChecks).toStrictEqual([
    {
      findingID: '1111111111111111',
      fixed: true,
      reason: 'The separator is a colon, and a test checks it.',
    },
  ]);
});

test("it asks nothing about a fix whose commit's patch passes the file limit, names the file as too large and rules no verdict", async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: {
        'src/scan.ts': 'export const separator = ":";\n',
        'src/scan.test.ts': `test("it splits on a colon", () => {\n${'  expect(split("a:b")).toStrictEqual(["a", "b"]);\n'.repeat(8)}});\n`,
      },
    },
    {
      message: 'Move the separator test',
      files: {
        'src/scan.test.ts': null,
        'src/separator.test.ts': 'test("it splits on a colon", () => {});\n',
      },
    },
  ]);

  const stub = buildStubAdapter({});

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[0] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
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
        postedHead: null,
      },
    ],
    maxFileChars: 400,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests).toStrictEqual([]);
  expect(result.fixChecks).toStrictEqual([]);
  expect(result.notReviewed).toStrictEqual([{ path: 'src/scan.ts', reason: 'too-large' }]);
});

test('it gives the call the diff of a fix in a file whose name git quotes', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = ":";\n' } },
    {
      message: 'Test the separator in the café locale',
      files: { 'src/café.test.ts': 'test("it splits on a colon", () => {});\n' },
    },
  ]);

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'A test now covers the separator.' }],
  });

  await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Test the separator in the café locale',
        lens: 'tests',
        path: 'src/scan.ts',
        line: 1,
        comment: 'No test covers the separator in the café locale.',
        commit: (repo.commits[1] ?? '').slice(0, 7),
        postedHead: null,
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude('+test("it splits on a colon", () => {});');
});

test('it reads a fix file whose name is a glob as that one file', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = ":";\n' } },
    {
      message: 'Test the separator',
      files: { 'src/[a].test.ts': 'test("it splits on a colon", () => {});\n' },
    },
    {
      message: 'Add the reader test',
      files: { 'src/a.test.ts': 'test("it reads a line", () => {});\n' },
    },
  ]);

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'A test now covers the separator.' }],
  });

  await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[0] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Test the separator',
        lens: 'tests',
        path: 'src/scan.ts',
        line: 1,
        comment: 'No test covers the separator.',
        commit: (repo.commits[1] ?? '').slice(0, 7),
        postedHead: null,
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude('+test("it splits on a colon", () => {});');
  expect(stub.requests[0]?.prompt).not.toInclude('it reads a line');
});

test('it judges a fix whose commit changes no file of the pull request not fixed with no call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    { message: 'Add notes', files: { 'notes.txt': 'split on a colon\n' } },
    { message: 'Remove the notes', files: { 'notes.txt': null } },
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
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
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
        postedHead: null,
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(result.fixChecks).toStrictEqual([
    {
      findingID: '1111111111111111',
      fixed: false,
      reason: 'the commit changes no file of the pull request',
    },
  ]);

  expect(stub.requests).toStrictEqual([]);
});

test('it judges a fix in a merge from the base branch by the files the merge changes against the branch', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    { message: 'Describe the app', files: { 'README.md': '# App\n' } },
    { message: 'Add the reader', files: { 'src/read.ts': 'export const read = 1;\n' }, parent: 0 },
    {
      message: 'Merge main and reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
      parent: 2,
      merged: 1,
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
    base: repo.commits[2] ?? '',
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[1] ?? '',
    lensHead: null,
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
        commit: (repo.commits[3] ?? '').slice(0, 7),
        postedHead: null,
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude(
    '-export const separator = "";\n+export const separator = ":";',
  );

  expect(result.fixChecks).toStrictEqual([
    { findingID: '1111111111111111', fixed: true, reason: 'The separator is a colon now.' },
  ]);
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
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
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
        postedHead: null,
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

test('it asks nothing about a fix before the reviewed head when no posting or lens head bounds it', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
    { message: 'Add a tab', files: { 'src/tab.ts': 'export const tab = "\\t";\n' } },
  ]);

  const stub = buildStubAdapter({
    'fix-2222222222222222': [{ fixed: true, reason: 'The tab is defined now.' }],
  });

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
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
        postedHead: null,
      },
      {
        id: '2222222222222222',
        title: 'Define the tab',
        lens: 'correctness',
        path: 'src/tab.ts',
        line: null,
        comment: 'The scanner reads a tab that no module defines.',
        commit: (repo.commits[2] ?? '').slice(0, 7),
        postedHead: null,
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests.map((request) => request.callID)).toStrictEqual(['fix-2222222222222222']);

  expect(result.fixChecks).toStrictEqual([
    { findingID: '2222222222222222', fixed: true, reason: 'The tab is defined now.' },
  ]);
});

test('it asks about a fixed reply whose commit came before the run, from the head that posted the finding', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
    { message: 'Add a tab', files: { 'src/tab.ts': 'export const tab = "\\t";\n' } },
  ]);

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
  });

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: repo.commits[0] ?? '',
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
        postedHead: repo.commits[0] ?? '',
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude(
    '-export const separator = "";\n+export const separator = ":";',
  );

  expect(result.base).toBe(repo.commits[0] ?? '');

  expect(result.fixChecks).toStrictEqual([
    { findingID: '1111111111111111', fixed: true, reason: 'The separator is a colon now.' },
  ]);
});

test('it asks nothing about a late fixed reply when a rebase left the head that posted the finding off the branch', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    { message: 'Describe the app', files: { 'README.md': '# app\n' } },
    {
      message: 'Reject an empty separator',
      parent: 0,
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
    { message: 'Add a tab', files: { 'src/tab.ts': 'export const tab = "\\t";\n' } },
  ]);

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
    'fix-2222222222222222': [{ fixed: true, reason: 'The tab is defined now.' }],
  });

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[2] ?? '',
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: repo.commits[0] ?? '',
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
        commit: (repo.commits[2] ?? '').slice(0, 7),
        postedHead: repo.commits[1] ?? '',
      },
      {
        id: '2222222222222222',
        title: 'Define the tab',
        lens: 'correctness',
        path: 'src/tab.ts',
        line: null,
        comment: 'The scanner reads a tab that no module defines.',
        commit: (repo.commits[3] ?? '').slice(0, 7),
        postedHead: null,
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests.map((request) => request.callID)).toStrictEqual(['fix-2222222222222222']);

  expect(result.fixChecks).toStrictEqual([
    { findingID: '2222222222222222', fixed: true, reason: 'The tab is defined now.' },
  ]);
});

test('it starts the diff of a late fixed reply at the lens head when the lens head is newer than the head that posted the finding', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Add the zero constant',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    { message: 'Add a tab', files: { 'src/tab.ts': 'export const tab = "\\t";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
    { message: 'Add a newline', files: { 'src/newline.ts': 'export const newline = "\\n";\n' } },
  ]);

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
  });

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[4] ?? '',
    head: repo.commits[4] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: repo.commits[2] ?? '',
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
        commit: (repo.commits[3] ?? '').slice(0, 7),
        postedHead: repo.commits[0] ?? '',
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude('+export const separator = ":";');
  expect(stub.requests[0]?.prompt).not.toInclude('+export const zero = 0;');
  expect(result.base).toBe(repo.commits[2] ?? '');
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
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
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
        postedHead: null,
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

test('it judges the fix of a static finding not fixed with no call when the run has no static check', async () => {
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
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
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
        postedHead: null,
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

test('it confirms the fix of a static finding that the static stage no longer reports at the head, with no call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const split = (line: string) => line;\n' } },
    {
      message: 'Test the scanner',
      files: {
        'src/scan.test.ts':
          "import { test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', () => {\n  split('a:b');\n});\n",
      },
    },
    {
      message: 'Assert the split',
      files: {
        'src/scan.test.ts':
          "import { expect, test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', () => {\n  expect(split('a:b')).toBe('a:b');\n});\n",
      },
    },
  ]);

  const stub = buildStubAdapter({});

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
    title: 'Test the scanner',
    configHash: 'hash',
    fixes: [
      {
        // the ID the static stage gives the unasserted test
        id: 'f3a135d185244d40',
        title: 'Test "it splits on the separator" asserts nothing',
        lens: 'static',
        path: 'src/scan.test.ts',
        line: 4,
        comment: 'The test body holds no assertion.',
        commit: (repo.commits[2] ?? '').slice(0, 7),
        postedHead: null,
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
    staticCheck: { config: BUILT_IN_DEFAULTS, body: '', linkedIssue: null, cacheDir: null },
  });

  expect(stub.requests).toStrictEqual([]);

  expect(result.fixChecks).toStrictEqual([
    {
      findingID: 'f3a135d185244d40',
      fixed: true,
      reason: 'the static check no longer reports it at the head',
    },
  ]);

  expect(result.findings).toStrictEqual([]);
  expect(result.calls).toStrictEqual([]);
});

test('it rejects the fix of a static finding that the static stage still reports at the head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const split = (line: string) => line;\n' } },
    {
      message: 'Test the scanner',
      files: {
        'src/scan.test.ts':
          "import { test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', () => {\n  split('a:b');\n});\n",
      },
    },
    {
      message: 'Split a longer line',
      files: {
        'src/scan.test.ts':
          "import { test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', () => {\n  split('a:b:c');\n});\n",
      },
    },
  ]);

  const stub = buildStubAdapter({});

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
    title: 'Test the scanner',
    configHash: 'hash',
    fixes: [
      {
        // the ID the static stage gives the unasserted test
        id: 'f3a135d185244d40',
        title: 'Test "it splits on the separator" asserts nothing',
        lens: 'static',
        path: 'src/scan.test.ts',
        line: 4,
        comment: 'The test body holds no assertion.',
        commit: (repo.commits[2] ?? '').slice(0, 7),
        postedHead: null,
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
    staticCheck: { config: BUILT_IN_DEFAULTS, body: '', linkedIssue: null, cacheDir: null },
  });

  expect(stub.requests).toStrictEqual([]);

  expect(result.fixChecks).toStrictEqual([
    {
      findingID: 'f3a135d185244d40',
      fixed: false,
      reason: 'the static check still reports it at the head',
    },
  ]);
});

test('it judges 2 static findings with one title by their places when a fix removes only the first', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const split = (line: string) => line;\n' } },
    {
      message: 'Test the scanner',
      files: {
        'src/scan.test.ts':
          "import { test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', () => {\n  split('a:b');\n});\n\ntest('it splits on the separator', () => {\n  split('c:d');\n});\n",
      },
    },
    {
      message: 'Assert the first split',
      files: {
        'src/scan.test.ts':
          "import { expect, test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', () => {\n  const parts = split('a:b');\n  expect(parts).toBe('a:b');\n});\n\ntest('it splits on the separator', () => {\n  split('c:d');\n});\n",
      },
    },
  ]);

  const stub = buildStubAdapter({});

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
    title: 'Test the scanner',
    configHash: 'hash',
    fixes: [
      {
        // the IDs the static stage gives the first and the second unasserted test
        id: 'f3a135d185244d40',
        title: 'Test "it splits on the separator" asserts nothing',
        lens: 'static',
        path: 'src/scan.test.ts',
        line: 4,
        comment: 'The test body holds no assertion.',
        commit: (repo.commits[2] ?? '').slice(0, 7),
        postedHead: repo.commits[1] ?? '',
      },
      {
        id: '280596d54d2e9243',
        title: 'Test "it splits on the separator" asserts nothing',
        lens: 'static',
        path: 'src/scan.test.ts',
        line: 8,
        comment: 'The test body holds no assertion.',
        commit: (repo.commits[2] ?? '').slice(0, 7),
        postedHead: repo.commits[1] ?? '',
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
    staticCheck: { config: BUILT_IN_DEFAULTS, body: '', linkedIssue: null, cacheDir: null },
  });

  expect(result.fixChecks).toStrictEqual([
    {
      findingID: 'f3a135d185244d40',
      fixed: true,
      reason: 'the static check no longer reports it at the head',
    },
    {
      findingID: '280596d54d2e9243',
      fixed: false,
      reason: 'the static check still reports it at the head',
    },
  ]);
});

test('it rejects the fix of a static finding whose fix rewrites the anchored line and leaves the test unasserted', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const split = (line: string) => line;\n' } },
    {
      message: 'Test the scanner',
      files: {
        'src/scan.test.ts':
          "import { test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', () => {\n  split('a:b');\n});\n\ntest('it splits on the separator', async () => {\n  split('c:d');\n});\n",
      },
    },
    {
      message: 'Make the first split test async',
      files: {
        'src/scan.test.ts':
          "import { test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', async () => {\n  split('a:b');\n});\n\ntest('it splits on the separator', async () => {\n  split('c:d');\n});\n",
      },
    },
  ]);

  const stub = buildStubAdapter({});

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
    title: 'Test the scanner',
    configHash: 'hash',
    fixes: [
      {
        // the ID the static stage gives the first unasserted test
        id: 'f3a135d185244d40',
        title: 'Test "it splits on the separator" asserts nothing',
        lens: 'static',
        path: 'src/scan.test.ts',
        line: 4,
        comment: 'The test body holds no assertion.',
        commit: (repo.commits[2] ?? '').slice(0, 7),
        postedHead: repo.commits[1] ?? '',
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
    staticCheck: { config: BUILT_IN_DEFAULTS, body: '', linkedIssue: null, cacheDir: null },
  });

  expect(result.fixChecks).toStrictEqual([
    {
      findingID: 'f3a135d185244d40',
      fixed: false,
      reason: 'the static check still reports it at the head',
    },
  ]);
});

test('it confirms the fix of a static finding whose fix deletes the test while another finding with its title remains', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const split = (line: string) => line;\n' } },
    {
      message: 'Test the scanner',
      files: {
        'src/scan.test.ts':
          "import { test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', () => {\n  split('a:b');\n});\n\ntest('it splits on the separator', async () => {\n  split('c:d');\n});\n",
      },
    },
    {
      message: 'Drop the first split test',
      files: {
        'src/scan.test.ts':
          "import { test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', async () => {\n  split('c:d');\n});\n",
      },
    },
  ]);

  const stub = buildStubAdapter({});

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    lensHead: null,
    title: 'Test the scanner',
    configHash: 'hash',
    fixes: [
      {
        // the ID the static stage gives the first unasserted test, which the remaining test takes
        id: 'f3a135d185244d40',
        title: 'Test "it splits on the separator" asserts nothing',
        lens: 'static',
        path: 'src/scan.test.ts',
        line: 4,
        comment: 'The test body holds no assertion.',
        commit: (repo.commits[2] ?? '').slice(0, 7),
        postedHead: repo.commits[1] ?? '',
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
    staticCheck: { config: BUILT_IN_DEFAULTS, body: '', linkedIssue: null, cacheDir: null },
  });

  expect(result.fixChecks).toStrictEqual([
    {
      findingID: 'f3a135d185244d40',
      fixed: true,
      reason: 'the static check no longer reports it at the head',
    },
  ]);
});

test('it refuses a run with no fixed answer to check over a commit that no lens read', async () => {
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

  expect(
    runFixesOnlyReview({
      runner: ctx.runner,
      repoDir: repo.path,
      repo: 'example/app',
      pullRequest: { owner: 'example', repo: 'app', number: 9 },
      base: repo.commits[1] ?? '',
      head: repo.commits[2] ?? '',
      mergeBase: repo.commits[0] ?? '',
      lensHead: repo.commits[1] ?? '',
      title: 'Scan the header line',
      configHash: 'hash',
      fixes: [],
      maxFileChars: 10_000,
      adapter: stub.adapter,
      tempDir: ctx.directory,
      logger: ctx.logger,
    }),
  ).rejects.toThrowWithMessage(
    Error,
    `--fixes-only has no \`fixed\` answer to check, so it cannot pass ${(repo.commits[2] ?? '').slice(0, 12)}, which no lens read and which is no merge of the base; run a review without --fixes-only`,
  );
});

test('it refuses a run with no fixed answer to check and no commit since the last review', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
  ]);

  const stub = buildStubAdapter({});

  expect(
    runFixesOnlyReview({
      runner: ctx.runner,
      repoDir: repo.path,
      repo: 'example/app',
      pullRequest: { owner: 'example', repo: 'app', number: 9 },
      base: repo.commits[1] ?? '',
      head: repo.commits[1] ?? '',
      mergeBase: repo.commits[0] ?? '',
      lensHead: repo.commits[1] ?? '',
      title: 'Scan the header line',
      configHash: 'hash',
      fixes: [],
      maxFileChars: 10_000,
      adapter: stub.adapter,
      tempDir: ctx.directory,
      logger: ctx.logger,
    }),
  ).rejects.toThrowWithMessage(
    Error,
    '--fixes-only has no `fixed` answer to check, and no commit came after the last review',
  );
});

test('it runs with no fixed answer to check when a rebase made the head of the reviewed head and no commit came after', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    { message: 'Describe the app', files: { 'README.md': '# app\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
      parent: 0,
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
      parent: 1,
    },
  ]);

  const stub = buildStubAdapter({});

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[3] ?? '',
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[1] ?? '',
    lensHead: repo.commits[3] ?? '',
    rebasedFrom: repo.commits[2] ?? '',
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests).toStrictEqual([]);

  expect(result).toMatchObject({
    base: repo.commits[3] ?? '',
    head: repo.commits[3] ?? '',
    fixChecks: [],
    failedCalls: [],
  });
});

test('it refuses a run with no fixed answer to check over a commit that came after the branch commit a rebase made of the reviewed head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    { message: 'Describe the app', files: { 'README.md': '# app\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
      parent: 0,
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
      parent: 1,
    },
    { message: 'Add a tab', files: { 'src/tab.ts': 'export const tab = "\\t";\n' } },
  ]);

  const stub = buildStubAdapter({});

  expect(
    runFixesOnlyReview({
      runner: ctx.runner,
      repoDir: repo.path,
      repo: 'example/app',
      pullRequest: { owner: 'example', repo: 'app', number: 9 },
      base: repo.commits[3] ?? '',
      head: repo.commits[4] ?? '',
      mergeBase: repo.commits[1] ?? '',
      lensHead: repo.commits[3] ?? '',
      rebasedFrom: repo.commits[2] ?? '',
      title: 'Scan the header line',
      configHash: 'hash',
      fixes: [],
      maxFileChars: 10_000,
      adapter: stub.adapter,
      tempDir: ctx.directory,
      logger: ctx.logger,
    }),
  ).rejects.toThrowWithMessage(
    Error,
    `--fixes-only has no \`fixed\` answer to check, so it cannot pass ${(repo.commits[4] ?? '').slice(0, 12)}, which no lens read and which is no merge of the base; run a review without --fixes-only`,
  );
});

test('it refuses a run with no fixed answer to check over a merge of a branch the base does not hold', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
    { message: 'Add a tab', files: { 'src/tab.ts': 'export const tab = "\\t";\n' }, parent: 0 },
    { message: 'Merge the tab branch', files: {}, parent: 1, merged: 2 },
  ]);

  const stub = buildStubAdapter({});

  expect(
    runFixesOnlyReview({
      runner: ctx.runner,
      repoDir: repo.path,
      repo: 'example/app',
      pullRequest: { owner: 'example', repo: 'app', number: 9 },
      base: repo.commits[1] ?? '',
      head: repo.commits[3] ?? '',
      mergeBase: repo.commits[0] ?? '',
      lensHead: repo.commits[1] ?? '',
      title: 'Scan the header line',
      configHash: 'hash',
      fixes: [],
      maxFileChars: 10_000,
      adapter: stub.adapter,
      tempDir: ctx.directory,
      logger: ctx.logger,
    }),
  ).rejects.toThrowWithMessage(
    Error,
    `--fixes-only has no \`fixed\` answer to check, so it cannot pass ${(repo.commits[3] ?? '').slice(0, 12)}, which no lens read and which is no merge of the base; run a review without --fixes-only`,
  );
});

test('it runs with no fixed answer to check when each new commit is a merge of the base', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
    { message: 'Add a tab', files: { 'src/tab.ts': 'export const tab = "\\t";\n' }, parent: 0 },
    { message: 'Merge main', files: {}, parent: 1, merged: 2 },
  ]);

  const stub = buildStubAdapter({});

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[2] ?? '',
    lensHead: repo.commits[1] ?? '',
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests).toStrictEqual([]);

  expect(result).toMatchObject({
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    fixChecks: [],
    failedCalls: [],
  });
});
