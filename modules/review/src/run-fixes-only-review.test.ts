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
        hint: (repo.commits[1] ?? '').slice(0, 7),
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

test("it gives the call the whole numbered file at the head and the pull request's net diff when the finding names no head", async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n',
        'src/other.ts': 'export const other = 1;\n',
      },
    },
    { message: 'Bump the other value', files: { 'src/other.ts': 'export const other = 2;\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
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
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
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
        hint: (repo.commits[2] ?? '').slice(0, 7),
        postedHead: null,
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude(
    '## The whole file `src/scan.ts` at the head, since the finding\'s lines could not be traced there\n\n```text\n1: export const zero = 0;\n2: export const separator = ":";\n```',
  );

  expect(stub.requests[0]?.prompt).toInclude(
    '-export const separator = "";\n+export const separator = ":";',
  );

  expect(stub.requests[0]?.prompt).toInclude('-export const other = 1;\n+export const other = 2;');
});

test('it judges a fixed answer whose commit a rebase left off the branch at the head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'README.md': '# App\n' } },
    { message: 'Describe the app', files: { 'README.md': '# App, which scans\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const separator = "";\n' },
      parent: 0,
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const separator = "";\n' },
      parent: 1,
    },
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
    base: repo.commits[1] ?? '',
    head: repo.commits[5] ?? '',
    mergeBase: repo.commits[1] ?? '',
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
        hint: (repo.commits[3] ?? '').slice(0, 7),
        postedHead: repo.commits[2] ?? '',
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

  expect(stub.requests[0]?.prompt).toInclude('```text\n1: export const separator = ":";\n```');
  expect(stub.requests[0]?.prompt).toInclude('+export const separator = ":";');
  expect(result.base).toBe(repo.commits[1] ?? '');
});

test('it judges a fixed answer whose commit a squash of the layer below replaced at the head, from the traced lines', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'README.md': '# App\n' } },
    { message: 'Add the scanner', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
    {
      message: 'Split each line on the separator',
      files: {
        'src/split.ts':
          'import { separator } from "./scan";\nexport const split = (line: string) => line.split(separator);\n',
      },
    },
    {
      message: 'Add the scanner (#12)',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
      parent: 0,
    },
    {
      message: 'Split each line on the separator',
      files: {
        'src/split.ts':
          'import { separator } from "./scan";\nexport const split = (line: string) => line.split(separator);\n',
      },
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
    base: repo.commits[4] ?? '',
    head: repo.commits[5] ?? '',
    mergeBase: repo.commits[4] ?? '',
    title: 'Split the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/split.ts',
        line: 2,
        comment: 'An empty separator splits the line into single characters.',
        hint: (repo.commits[2] ?? '').slice(0, 7),
        postedHead: repo.commits[3] ?? '',
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

  expect(stub.requests[0]?.prompt).toInclude(
    '## The code at `src/split.ts` at the head, around the finding\'s lines\n\n```text\n1: import { separator } from "./scan";\n2: export const split = (line: string) => line.split(separator);\n```',
  );
});

test('it judges a bare fixed answer, which names no commit, at the head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
  ]);

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: false, reason: 'The separator can still be empty.' }],
  });

  const result = await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    mergeBase: repo.commits[0] ?? '',
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
        hint: null,
        postedHead: repo.commits[0] ?? '',
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(result.fixChecks).toStrictEqual([
    { findingID: '1111111111111111', fixed: false, reason: 'The separator can still be empty.' },
  ]);

  expect(stub.requests[0]?.prompt).toInclude('```text\n1: export const separator = ":";\n```');
});

test("it traces the finding's line past the lines a later commit adds above it", async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'README.md': '# App\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Test the separator and add the filler constants',
      files: {
        'src/scan.ts': `${'export const filler = 0;\n'.repeat(30)}export const zero = 0;\nexport const separator = "";\n`,
        'src/scan.test.ts': 'test("it rejects an empty separator", () => {});\n',
      },
    },
  ]);

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: false, reason: 'The separator is still empty.' }],
  });

  await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
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
        hint: null,
        postedHead: repo.commits[1] ?? '',
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude(
    "## The code at `src/scan.ts` at the head, around the finding's lines\n\n```text\n12: export const filler = 0;",
  );

  expect(stub.requests[0]?.prompt).toInclude('32: export const separator = "";\n```');
});

test('it gives the call the whole file at the head when a later commit rewrote the finding line', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'README.md': '# App\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
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
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
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
        hint: null,
        postedHead: repo.commits[1] ?? '',
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude(
    '## The whole file `src/scan.ts` at the head, since the finding\'s lines could not be traced there\n\n```text\n1: export const zero = 0;\n2: export const separator = ":";\n```',
  );
});

test('it gives the call the whole file at the head when the repo holds no commit of the head that posted the finding', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'README.md': '# App\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
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
    mergeBase: repo.commits[0] ?? '',
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
        hint: null,
        postedHead: 'e'.repeat(40),
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude(
    '## The whole file `src/scan.ts` at the head, since the finding\'s lines could not be traced there\n\n```text\n1: export const zero = 0;\n2: export const separator = ":";\n```',
  );
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
        hint: (repo.commits[1] ?? '').slice(0, 7),
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

test('it gives the call the net diff where a later commit moved the code and the test of the fix to other files', async () => {
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

  await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[0] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
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
        hint: (repo.commits[1] ?? '').slice(0, 7),
        postedHead: null,
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude(
    '+++ b/src/separator.test.ts\n@@ -0,0 +1 @@\n+test("it splits on a colon", () => {});',
  );

  expect(stub.requests[0]?.prompt).toInclude(
    '+++ b/src/separator.ts\n@@ -0,0 +1 @@\n+export const separator = ":";',
  );

  expect(stub.requests[0]?.prompt).not.toInclude('src/scan.test.ts');
});

test('it asks nothing about a fix whose file at the head passes the file limit, names the file as too large and rules no verdict', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/scan.ts': `export const separator = "";\n${'export const width = 80; // the width of a line\n'.repeat(12)}`,
      },
    },
    {
      message: 'Reject an empty separator',
      files: {
        'src/scan.ts': `export const separator = ":";\n${'export const width = 80; // the width of a line\n'.repeat(12)}`,
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
    head: repo.commits[1] ?? '',
    mergeBase: repo.commits[0] ?? '',
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
        hint: null,
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
        hint: (repo.commits[1] ?? '').slice(0, 7),
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

test("it reads the finding file's diff alone by its literal path, though the path reads as a glob", async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/[a].ts': 'export const separator = "";\n', 'src/a.ts': 'alpha\n' },
    },
    {
      message: 'Reject an empty separator',
      files: {
        'src/[a].ts': 'export const separator = ":";\n',
        'src/a.ts': 'word\n'.repeat(400),
      },
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
    title: 'Scan the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/[a].ts',
        line: 1,
        comment: 'An empty separator splits the line into single characters.',
        hint: null,
        postedHead: null,
      },
    ],
    maxFileChars: 1000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(result.fixChecks).toStrictEqual([
    { findingID: '1111111111111111', fixed: true, reason: 'The separator is a colon now.' },
  ]);

  expect(result.notReviewed).toStrictEqual([]);
});

test("it gives the call the finding file's diff alone when the whole diff passes the file limit", async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/scan.ts': 'export const separator = "";\n', 'data/words.txt': 'alpha\n' },
    },
    {
      message: 'Reject an empty separator',
      files: {
        'src/scan.ts': 'export const separator = ":";\n',
        'data/words.txt': 'word\n'.repeat(400),
      },
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
        hint: null,
        postedHead: null,
      },
    ],
    maxFileChars: 1000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  const prompt = stub.requests[0]?.prompt ?? '';

  expect(result.fixChecks).toStrictEqual([
    { findingID: '1111111111111111', fixed: true, reason: 'The separator is a colon now.' },
  ]);

  expect(prompt).toInclude('+export const separator = ":";');
  expect(prompt).not.toInclude('data/words.txt');
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
        hint: (repo.commits[1] ?? '').slice(0, 7),
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

test("it traces a finding in a file whose name is a glob through that one file's change", async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'README.md': '# App\n' } },
    {
      message: 'Add the readers',
      files: {
        'src/[a].ts': 'export const separator = "";\n',
        'src/a.ts': 'export const reader = 1;\n',
      },
    },
    {
      message: 'Rewrite the other reader',
      files: { 'src/a.ts': 'export const reader = 2;\n' },
    },
  ]);

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: false, reason: 'The separator is still empty.' }],
  });

  await runFixesOnlyReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/app',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    title: 'Read the header line',
    configHash: 'hash',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/[a].ts',
        line: 1,
        comment: 'An empty separator splits the line into single characters.',
        hint: null,
        postedHead: repo.commits[1] ?? '',
      },
    ],
    maxFileChars: 10_000,
    adapter: stub.adapter,
    tempDir: ctx.directory,
    logger: ctx.logger,
  });

  expect(stub.requests[0]?.prompt).toInclude(
    "## The code at `src/[a].ts` at the head, around the finding's lines",
  );
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
        hint: (repo.commits[1] ?? '').slice(0, 7),
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
        hint: (repo.commits[1] ?? '').slice(0, 7),
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
        hint: (repo.commits[2] ?? '').slice(0, 7),
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
        hint: (repo.commits[2] ?? '').slice(0, 7),
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
        hint: (repo.commits[2] ?? '').slice(0, 7),
        postedHead: repo.commits[1] ?? '',
      },
      {
        id: '280596d54d2e9243',
        title: 'Test "it splits on the separator" asserts nothing',
        lens: 'static',
        path: 'src/scan.test.ts',
        line: 8,
        comment: 'The test body holds no assertion.',
        hint: (repo.commits[2] ?? '').slice(0, 7),
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
        hint: (repo.commits[2] ?? '').slice(0, 7),
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
        hint: (repo.commits[2] ?? '').slice(0, 7),
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
