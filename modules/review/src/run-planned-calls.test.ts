import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { buildCallPrompt } from '@noslop/lenses';
import { buildMockChangedFile, buildMockSlices, buildStubAdapter } from '@noslop/testing';
import { runPlannedCalls } from './run-planned-calls';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-calls-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, logger: getLogger(['test']) };
}

test('it gives each part of a split call an ID that no other call of the review holds', async () => {
  const ctx = await setupTest();

  const files = ['src/a.ts', 'src/b.ts'].map((path) =>
    buildMockChangedFile({
      path,
      hunks: [
        {
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          lines: [{ kind: 'added', text: 'x'.repeat(5000), oldLine: null, newLine: 1 }],
        },
      ],
    }),
  );

  const base = buildCallPrompt({
    lenses: ['correctness'],
    files: [],
    slices: buildMockSlices(),
    rules: null,
    title: 'feat: add the tables',
    body: '',
    linkedIssue: null,
    leftOut: files.map((file) => ({ path: file.path, reason: 'other-part' })),
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    isIncremental: false,
  });

  const stub = buildStubAdapter({
    A: [{ findings: { correctness: [] } }],
    'A-part-2': [{ findings: { security: [] } }],
    'A-part-2-2': [{ findings: { correctness: [] } }],
  });

  const batch = await runPlannedCalls({
    calls: [
      {
        callID: 'A',
        lenses: ['correctness'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files,
      },
      {
        callID: 'A-part-2',
        lenses: ['security'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files: [buildMockChangedFile({ path: 'src/c.ts' })],
      },
    ],
    depth: 'standard',
    adapter: stub.adapter,
    worktree: ctx.dir,
    tempDir: ctx.dir,
    logger: ctx.logger,
    slices: buildMockSlices(),
    rules: null,
    title: 'feat: add the tables',
    body: '',
    linkedIssue: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    isIncremental: false,
    parallel: 1,
    data: [],
    maxCallChars: base.length + 6000,
    maxFileChars: 250_000,
  });

  expect(batch.records.map((record) => [record.id, record.status])).toStrictEqual([
    ['A', 'ok'],
    ['A-part-2-2', 'ok'],
    ['A-part-2', 'ok'],
  ]);
});

test('it lists no file as not reviewed when another call reads it', async () => {
  const ctx = await setupTest();

  const file = buildMockChangedFile({ path: 'src/parse.ts' });

  const stub = buildStubAdapter({
    A: [{ findings: { correctness: [] } }],
    E: [{ findings: { intent: [] } }],
  });

  const batch = await runPlannedCalls({
    calls: [
      {
        callID: 'A',
        lenses: ['correctness'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files: [file],
      },
      {
        callID: 'E',
        lenses: ['intent'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files: [file],
      },
    ],
    depth: 'standard',
    adapter: stub.adapter,
    worktree: ctx.dir,
    tempDir: ctx.dir,
    logger: ctx.logger,
    slices: buildMockSlices({
      functions: [
        {
          location: { path: 'src/parse.ts', startLine: 1, endLine: 1 },
          name: 'x'.repeat(3000),
          params: [],
          exported: true,
          isNew: true,
          complexity: 1,
          ioCalls: [],
          writes: [],
        },
      ],
    }),
    rules: null,
    title: 'feat: add the parser',
    body: '',
    linkedIssue: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    isIncremental: false,
    parallel: 1,
    data: [],
    maxCallChars: 1_000_000,
    maxFileChars: 2000,
  });

  expect(stub.requests.map((request) => request.callID)).toStrictEqual(['A', 'E']);
  expect(batch.notReviewed).toStrictEqual([]);
});

test('it lists a file as not reviewed when the only call that keeps it reads no hunks of its kind', async () => {
  const ctx = await setupTest();

  const table = buildMockChangedFile({
    path: 'src/table.ts',
    hunks: [
      {
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ kind: 'added', text: 'x'.repeat(3000), oldLine: null, newLine: 1 }],
      },
    ],
  });

  const readme = buildMockChangedFile({ path: 'README.md', kind: 'prose' });

  const stub = buildStubAdapter({
    A: [{ findings: { correctness: [] } }],
    H: [{ findings: { documentation: [] } }],
  });

  const batch = await runPlannedCalls({
    calls: [
      {
        callID: 'A',
        lenses: ['correctness'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files: [table, readme],
      },
      {
        callID: 'H',
        lenses: ['documentation'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files: [table, readme],
      },
    ],
    depth: 'standard',
    adapter: stub.adapter,
    worktree: ctx.dir,
    tempDir: ctx.dir,
    logger: ctx.logger,
    slices: buildMockSlices(),
    rules: null,
    title: 'feat: add the table and its readme',
    body: '',
    linkedIssue: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    isIncremental: false,
    parallel: 1,
    data: [],
    maxCallChars: 1_000_000,
    maxFileChars: 2000,
  });

  expect(batch.notReviewed).toStrictEqual([{ path: 'src/table.ts', reason: 'too-large' }]);
});
