import { expect, test } from 'bun:test';
import { buildCallPrompt } from '@noslop/lenses';
import { buildMockChangedFile, buildMockSlices } from '@noslop/testing';
import { planCallBatch } from './plan-call-batch';

test('it gives each part of a split call an ID that no other call of the review holds', () => {
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
    reviewLenses: ['correctness'],
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

  const plan = planCallBatch({
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
    slices: buildMockSlices(),
    rules: null,
    title: 'feat: add the tables',
    body: '',
    linkedIssue: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    isIncremental: false,
    data: [],
    maxCallChars: base.length + 6000,
    maxFileChars: 250_000,
  });

  expect(plan.parts.map((part) => part.call.callID)).toStrictEqual([
    'correctness',
    'correctness-part-2-2',
    'correctness-part-2',
  ]);
});

test('it lists no file as not reviewed when another call reads its hunks', () => {
  const file = buildMockChangedFile({ path: 'src/parse.ts' });

  const plan = planCallBatch({
    calls: [
      {
        callID: 'correctness',
        lenses: ['correctness'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files: [file],
      },
      {
        callID: 'intent',
        lenses: ['intent'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files: [file],
      },
    ],
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
    data: [],
    maxCallChars: 1_000_000,
    maxFileChars: 2000,
  });

  expect(plan.parts.map((part) => part.call.callID)).toStrictEqual(['intent']);
  expect(plan.notReviewed).toStrictEqual([]);
});

test('it lists a file as not reviewed when the only call that keeps it reads no hunks of its kind', () => {
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

  const plan = planCallBatch({
    calls: [
      {
        callID: 'correctness',
        lenses: ['correctness'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files: [table, readme],
      },
      {
        callID: 'documentation',
        lenses: ['documentation'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files: [table, readme],
      },
    ],
    slices: buildMockSlices(),
    rules: null,
    title: 'feat: add the table and its readme',
    body: '',
    linkedIssue: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    isIncremental: false,
    data: [],
    maxCallChars: 1_000_000,
    maxFileChars: 2000,
  });

  expect(plan.notReviewed).toStrictEqual([{ path: 'src/table.ts', reason: 'too-large' }]);
  expect(plan.notReviewedByLens).toStrictEqual([]);
});

test("it lists a file under the lens whose call leaves it out when another lens's call reads it", () => {
  const file = buildMockChangedFile({ path: 'src/parse.ts' });

  const plan = planCallBatch({
    calls: [
      {
        callID: 'correctness',
        lenses: ['correctness', 'tests'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files: [file],
      },
      {
        callID: 'intent',
        lenses: ['intent'],
        effort: 'medium',
        model: null,
        timeoutMs: null,
        files: [file],
      },
    ],
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
    data: [],
    maxCallChars: 1_000_000,
    maxFileChars: 2000,
  });

  expect(plan.notReviewedByLens).toStrictEqual([
    { path: 'src/parse.ts', lenses: ['correctness', 'tests'] },
  ]);
});
