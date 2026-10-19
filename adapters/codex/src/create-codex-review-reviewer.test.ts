import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from '@noslop/runner';
import { buildStubRunner, createStubCLI } from '@noslop/testing';
import { createCodexReviewReviewer } from './create-codex-review-reviewer';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-codex-review-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it runs codex review read-only against the case base in the worktree', async () => {
  const ctx = await setupTest();

  const stub = buildStubRunner([{ argv: ['codex', 'exec', 'review'], result: { exitCode: 0 } }]);

  const reviewer = createCodexReviewReviewer({
    runner: stub.runner,
    tempDir: ctx.directory,
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
        '--json',
        '-c',
        'sandbox_mode="read-only"',
        '-o',
        expect.toStartWith(join(ctx.directory, 'codex-review-')),
      ],
      options: { cwd: '/work/case-1', timeoutMs: 60_000 },
    },
  ]);
});

test('it runs codex review against the last reviewed head of a re-review case', async () => {
  const ctx = await setupTest();

  const stub = buildStubRunner([{ argv: ['codex', 'exec', 'review'], result: { exitCode: 0 } }]);

  const reviewer = createCodexReviewReviewer({
    runner: stub.runner,
    tempDir: ctx.directory,
    timeoutMs: 60_000,
  });

  await reviewer.reviewCase(
    {
      id: 'case-1',
      repo: '/repos/app',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      reviewedHead: 'c'.repeat(40),
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
        'c'.repeat(40),
        '--json',
        '-c',
        'sandbox_mode="read-only"',
        '-o',
        expect.toStartWith(join(ctx.directory, 'codex-review-')),
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
    tempDir: ctx.directory,
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
    tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
    durationMs: 40,
    calls: 1,
    depth: null,
  });
});

test('it reads the token use of a review from the session of the thread it started', async () => {
  const ctx = await setupTest();

  // Codex files a session under the local date the review starts on
  const today = new Date();

  const childFile = join(
    ctx.directory,
    'codex-home',
    'sessions',
    String(today.getFullYear()),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
    'rollout-child.jsonl',
  );

  await Bun.write(
    childFile,
    [
      '{"type":"session_meta","payload":{"id":"t_child","parent_thread_id":"t_parent"}}',
      '{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":43922,"cached_input_tokens":29312,"cache_write_input_tokens":0,"output_tokens":650}}}}',
    ].join('\n'),
  );

  // the stub writes no session, so the session file is dated after the review starts
  const later = new Date(Date.now() + 60_000);

  await utimes(childFile, later, later);

  const stub = await createStubCLI(ctx.directory, {
    outputFlag: '-o',
    lastMessage:
      '- [P2] Subtract in place of the sum — /work/case-1/add.ts:2-2\n  The sum turns into a difference.',
    stdout: [
      '{"type":"thread.started","thread_id":"t_parent"}',
      '{"type":"turn.completed","usage":{"input_tokens":0,"cached_input_tokens":0,"output_tokens":0}}',
      '',
    ].join('\n'),
    stderr: '',
    exitCode: 0,
    delayMs: 0,
  });

  const reviewer = createCodexReviewReviewer({
    runner: createRunner(),
    tempDir: ctx.directory,
    timeoutMs: 60_000,
    command: stub.path,
    codexHome: join(ctx.directory, 'codex-home'),
  });

  const review = await reviewer.reviewCase(
    {
      id: 'case-1',
      repo: '/repos/app',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      title: 'fix: keep the sum',
      body: '',
      findings: [],
      escapes: [],
    },
    ctx.directory,
  );

  expect(review.tokens).toStrictEqual({
    input: 14_610,
    cachedInput: 29_312,
    cacheWrite: 0,
    output: 650,
  });
});

test('it rejects a finished review that names no thread', async () => {
  const ctx = await setupTest();

  const stub = await createStubCLI(ctx.directory, {
    outputFlag: '-o',
    lastMessage: 'No findings.',
    stdout: '',
    stderr: '',
    exitCode: 0,
    delayMs: 0,
  });

  const reviewer = createCodexReviewReviewer({
    runner: createRunner(),
    tempDir: ctx.directory,
    timeoutMs: 60_000,
    command: stub.path,
    codexHome: join(ctx.directory, 'codex-home'),
  });

  expect(
    reviewer.reviewCase(
      {
        id: 'case-1',
        repo: '/repos/app',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'fix: keep the sum',
        body: '',
        findings: [],
        escapes: [],
      },
      ctx.directory,
    ),
  ).rejects.toThrowWithMessage(
    Error,
    'codex review left no session of its review thread to read its tokens from',
  );
});

test('it removes the session files of its own review and never another run', async () => {
  const ctx = await setupTest();

  const today = new Date();

  const day = join(
    ctx.directory,
    'codex-home',
    'sessions',
    String(today.getFullYear()),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  );

  await Bun.write(
    join(day, 'rollout-parent.jsonl'),
    '{"type":"session_meta","payload":{"id":"t_parent","source":"exec"}}',
  );

  await Bun.write(
    join(day, 'rollout-child.jsonl'),
    [
      '{"type":"session_meta","payload":{"id":"t_child","parent_thread_id":"t_parent"}}',
      '{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":100,"cached_input_tokens":0,"output_tokens":5}}}}',
    ].join('\n'),
  );

  await Bun.write(
    join(day, 'rollout-other.jsonl'),
    '{"type":"session_meta","payload":{"id":"t_other_child","parent_thread_id":"t_other"}}',
  );

  // the stub writes no session, so each session file is dated after the review starts
  const later = new Date(Date.now() + 60_000);

  await utimes(join(day, 'rollout-parent.jsonl'), later, later);
  await utimes(join(day, 'rollout-child.jsonl'), later, later);
  await utimes(join(day, 'rollout-other.jsonl'), later, later);

  const stub = await createStubCLI(ctx.directory, {
    outputFlag: '-o',
    lastMessage: 'No findings.',
    stdout: '{"type":"thread.started","thread_id":"t_parent"}\n',
    stderr: '',
    exitCode: 0,
    delayMs: 0,
  });

  const reviewer = createCodexReviewReviewer({
    runner: createRunner(),
    tempDir: ctx.directory,
    timeoutMs: 60_000,
    command: stub.path,
    codexHome: join(ctx.directory, 'codex-home'),
  });

  await reviewer.reviewCase(
    {
      id: 'case-1',
      repo: '/repos/app',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      title: 'fix: keep the sum',
      body: '',
      findings: [],
      escapes: [],
    },
    ctx.directory,
  );

  const left = await readdir(day);

  expect(left).toStrictEqual(['rollout-other.jsonl']);
});
