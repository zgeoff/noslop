import { expect, test } from 'bun:test';
import { buildCallPrompt } from '@noslop/lenses';
import { buildMockChangedFile, buildMockSlices } from '@noslop/testing';
import { planCallParts } from './plan-call-parts';

test('it keeps a call whole when its prompt fits the limit', () => {
  const file = buildMockChangedFile({ path: 'src/a.ts' });

  const planned = planCallParts({
    call: {
      callID: 'A',
      lenses: ['correctness'],
      effort: 'medium',
      model: null,
      timeoutMs: null,
      files: [file],
    },
    shared: {
      slices: buildMockSlices(),
      rules: null,
      title: 'feat: add a',
      body: '',
      linkedIssue: null,
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      isIncremental: false,
    },
    data: [],
    maxCallChars: 1_000_000,
    maxFileChars: 250_000,
    taken: new Set(['A']),
  });

  expect(planned.parts.map((part) => [part.call.callID, part.call.files])).toStrictEqual([
    ['A', [file]],
  ]);

  expect(planned.notReviewed).toStrictEqual([]);
});

test('it splits a call over the limit into parts that each fit, with every file in one part', () => {
  const shared = {
    slices: buildMockSlices(),
    rules: null,
    title: 'feat: add the tables',
    body: '',
    linkedIssue: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    isIncremental: false,
  };

  const files = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'].map((path) =>
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
    ...shared,
    lenses: ['correctness'],
    files: [],
    leftOut: files.map((file) => ({ path: file.path, reason: 'other-part' })),
  });

  const maxCallChars = base.length + 12_000;

  const planned = planCallParts({
    call: {
      callID: 'A',
      lenses: ['correctness'],
      effort: 'medium',
      model: null,
      timeoutMs: null,
      files,
    },
    shared,
    data: [],
    maxCallChars,
    maxFileChars: 250_000,
    taken: new Set(['A']),
  });

  expect(
    planned.parts.map((part) => [part.call.callID, part.call.files.map((file) => file.path)]),
  ).toStrictEqual([
    ['A', ['src/a.ts', 'src/b.ts']],
    ['A-part-2', ['src/c.ts', 'src/d.ts']],
  ]);

  expect(planned.parts.map((part) => part.prompt.length)).toSatisfyAll(
    (length: number) => length <= maxCallChars,
  );

  expect(planned.notReviewed).toStrictEqual([]);
});

test('it names the files of the other parts in each part prompt', () => {
  const shared = {
    slices: buildMockSlices(),
    rules: null,
    title: 'feat: add the tables',
    body: '',
    linkedIssue: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    isIncremental: false,
  };

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
    ...shared,
    lenses: ['correctness'],
    files: [],
    leftOut: files.map((file) => ({ path: file.path, reason: 'other-part' })),
  });

  const planned = planCallParts({
    call: {
      callID: 'A',
      lenses: ['correctness'],
      effort: 'medium',
      model: null,
      timeoutMs: null,
      files,
    },
    shared,
    data: [],
    maxCallChars: base.length + 6000,
    maxFileChars: 250_000,
    taken: new Set(['A']),
  });

  expect(planned.parts.map((part) => part.prompt)).toStrictEqual([
    expect.toInclude('- src/b.ts: read by another call of this review'),
    expect.toInclude('- src/a.ts: read by another call of this review'),
  ]);
});

test('it gives a later part an ID that no configured call holds', () => {
  const shared = {
    slices: buildMockSlices(),
    rules: null,
    title: 'feat: add the tables',
    body: '',
    linkedIssue: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    isIncremental: false,
  };

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
    ...shared,
    lenses: ['correctness'],
    files: [],
    leftOut: files.map((file) => ({ path: file.path, reason: 'other-part' })),
  });

  const planned = planCallParts({
    call: {
      callID: 'A',
      lenses: ['correctness'],
      effort: 'medium',
      model: null,
      timeoutMs: null,
      files,
    },
    shared,
    data: [],
    maxCallChars: base.length + 6000,
    maxFileChars: 250_000,
    taken: new Set(['A', 'A-part-2']),
  });

  expect(planned.parts.map((part) => part.call.callID)).toStrictEqual(['A', 'A-part-2-2']);
});

test('it leaves a file that matches a data glob out of the call and lists it', () => {
  const code = buildMockChangedFile({ path: 'src/a.ts' });
  const corpus = buildMockChangedFile({ path: 'samples/corpus.jsonl', kind: 'other' });

  const planned = planCallParts({
    call: {
      callID: 'A',
      lenses: ['correctness'],
      effort: 'medium',
      model: null,
      timeoutMs: null,
      files: [code, corpus],
    },
    shared: {
      slices: buildMockSlices(),
      rules: null,
      title: 'chore: refresh the corpus',
      body: '',
      linkedIssue: null,
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      isIncremental: false,
    },
    data: ['samples/**'],
    maxCallChars: 1_000_000,
    maxFileChars: 250_000,
    taken: new Set(['A']),
  });

  expect(planned.parts.map((part) => part.call.files)).toStrictEqual([[code]]);

  expect(planned.parts[0]?.prompt).toInclude(
    '- samples/corpus.jsonl: a data file the config names',
  );

  expect(planned.notReviewed).toStrictEqual([{ path: 'samples/corpus.jsonl', reason: 'data' }]);
});

test('it leaves out a file whose hunks pass the file limit and lists it as too large', () => {
  const code = buildMockChangedFile({ path: 'src/a.ts' });

  const big = buildMockChangedFile({
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

  const planned = planCallParts({
    call: {
      callID: 'A',
      lenses: ['correctness'],
      effort: 'medium',
      model: null,
      timeoutMs: null,
      files: [code, big],
    },
    shared: {
      slices: buildMockSlices(),
      rules: null,
      title: 'feat: add the table',
      body: '',
      linkedIssue: null,
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      isIncremental: false,
    },
    data: [],
    maxCallChars: 1_000_000,
    maxFileChars: 2000,
    taken: new Set(['A']),
  });

  expect(planned.parts.map((part) => part.call.files)).toStrictEqual([[code]]);
  expect(planned.notReviewed).toStrictEqual([{ path: 'src/table.ts', reason: 'too-large' }]);
});

test('it counts the slice items of a file toward the file limit', () => {
  const code = buildMockChangedFile({ path: 'src/a.ts' });
  const parser = buildMockChangedFile({ path: 'src/parse.ts' });

  const planned = planCallParts({
    call: {
      callID: 'A',
      lenses: ['correctness'],
      effort: 'medium',
      model: null,
      timeoutMs: null,
      files: [code, parser],
    },
    shared: {
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
    },
    data: [],
    maxCallChars: 1_000_000,
    maxFileChars: 2000,
    taken: new Set(['A']),
  });

  expect(planned.parts.map((part) => part.call.files)).toStrictEqual([[code]]);
  expect(planned.notReviewed).toStrictEqual([{ path: 'src/parse.ts', reason: 'too-large' }]);
});

test('it lists a file that overflows a call alone as too large in the review and in the prompt', () => {
  const shared = {
    slices: buildMockSlices(),
    rules: null,
    title: 'feat: add the table',
    body: '',
    linkedIssue: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    isIncremental: false,
  };

  const code = buildMockChangedFile({ path: 'src/a.ts' });

  const big = buildMockChangedFile({
    path: 'src/table.ts',
    hunks: [
      {
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ kind: 'added', text: 'x'.repeat(5000), oldLine: null, newLine: 1 }],
      },
    ],
  });

  const base = buildCallPrompt({
    ...shared,
    lenses: ['correctness'],
    files: [],
    leftOut: [code, big].map((file) => ({ path: file.path, reason: 'other-part' })),
  });

  const planned = planCallParts({
    call: {
      callID: 'A',
      lenses: ['correctness'],
      effort: 'medium',
      model: null,
      timeoutMs: null,
      files: [code, big],
    },
    shared,
    data: [],
    maxCallChars: base.length + 3000,
    maxFileChars: 250_000,
    taken: new Set(['A']),
  });

  expect(planned.parts.map((part) => [part.call.callID, part.call.files])).toStrictEqual([
    ['A', [code]],
  ]);

  expect(planned.parts[0]?.prompt).toInclude('- src/table.ts: too large for one call');
  expect(planned.notReviewed).toStrictEqual([{ path: 'src/table.ts', reason: 'too-large' }]);
});

test('it runs no part and lists every file when each file overflows a call alone', () => {
  const shared = {
    slices: buildMockSlices(),
    rules: null,
    title: 'feat: add the tables',
    body: '',
    linkedIssue: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    isIncremental: false,
  };

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
    ...shared,
    lenses: ['correctness'],
    files: [],
    leftOut: files.map((file) => ({ path: file.path, reason: 'other-part' })),
  });

  const planned = planCallParts({
    call: {
      callID: 'A',
      lenses: ['correctness'],
      effort: 'medium',
      model: null,
      timeoutMs: null,
      files,
    },
    shared,
    data: [],
    maxCallChars: base.length + 3000,
    maxFileChars: 250_000,
    taken: new Set(['A']),
  });

  expect(planned.parts).toStrictEqual([]);

  expect(planned.notReviewed).toStrictEqual([
    { path: 'src/a.ts', reason: 'too-large' },
    { path: 'src/b.ts', reason: 'too-large' },
  ]);
});

test('it runs the call whole when the input around the files overflows alone', () => {
  const file = buildMockChangedFile({ path: 'src/a.ts' });

  const planned = planCallParts({
    call: {
      callID: 'A',
      lenses: ['correctness'],
      effort: 'medium',
      model: null,
      timeoutMs: null,
      files: [file],
    },
    shared: {
      slices: buildMockSlices(),
      rules: null,
      title: 'feat: add a',
      body: 'y'.repeat(5000),
      linkedIssue: null,
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      isIncremental: false,
    },
    data: [],
    maxCallChars: 1000,
    maxFileChars: 250_000,
    taken: new Set(['A']),
  });

  expect(planned.parts.map((part) => [part.call.callID, part.call.files])).toStrictEqual([
    ['A', [file]],
  ]);

  expect(planned.notReviewed).toStrictEqual([]);
});
