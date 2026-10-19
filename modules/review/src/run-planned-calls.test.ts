import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { buildCallPrompt } from '@noslop/lenses';
import { buildMockChangedFile, buildMockSlices, buildStubAdapter } from '@noslop/testing';
import { runPlannedCalls } from './run-planned-calls';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-calls-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, logger: getLogger(['test']) };
}

test('it runs each part of a split call and records it under its own ID', async () => {
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
    correctness: [{ findings: { correctness: [] } }],
    'correctness-part-2': [{ findings: { security: [] } }],
    'correctness-part-2-2': [{ findings: { correctness: [] } }],
  });

  const batch = await runPlannedCalls({
    calls: [
      {
        callID: 'correctness',
        lenses: ['correctness'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files,
      },
      {
        callID: 'correctness-part-2',
        lenses: ['security'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files: [buildMockChangedFile({ path: 'src/c.ts' })],
      },
    ],
    depth: 'standard',
    adapter: stub.adapter,
    worktree: ctx.directory,
    tempDir: ctx.directory,
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
    ['correctness', 'ok'],
    ['correctness-part-2-2', 'ok'],
    ['correctness-part-2', 'ok'],
  ]);
});
