import { expect, test } from 'bun:test';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import type { SpecialChange } from '@noslop/contract';
import { buildMockChangedFile, buildMockRiskSignals, buildMockSlices } from '@noslop/testing';
import { buildRoute } from './build-route';

test('it runs a small code change at Light in one call', () => {
  const file = buildMockChangedFile();

  const route = buildRoute({
    change: { base: 'a'.repeat(40), head: 'b'.repeat(40), files: [file], excluded: [] },
    slices: buildMockSlices(),
    signals: buildMockRiskSignals(),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect(route).toStrictEqual({
    special: null,
    lenses: ['correctness'],
    depth: 'light',
    calls: [
      {
        callID: 'light',
        lenses: ['correctness'],
        effort: 'low',
        model: null,
        timeoutMs: null,
        files: [file],
      },
    ],
  });
});

test('it reviews a small code change at the depth it is forced to', () => {
  const file = buildMockChangedFile();

  const route = buildRoute(
    {
      change: { base: 'a'.repeat(40), head: 'b'.repeat(40), files: [file], excluded: [] },
      slices: buildMockSlices(),
      signals: buildMockRiskSignals(),
      config: BUILT_IN_DEFAULTS,
      linkedIssue: null,
      isSync: false,
      isRelease: false,
      isPush: false,
    },
    'deep',
  );

  expect(route.depth).toBe('deep');

  expect(route.calls.map((call) => [call.callID, call.effort])).toStrictEqual([
    ['correctness', 'high'],
  ]);
});

test('it fires each lens whose slice holds an entry and groups them by the default calls', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile({ addedLines: 500 })],
      excluded: [],
    },
    slices: buildMockSlices({
      throws: [
        {
          location: { path: 'src/a.ts', startLine: 4, endLine: 4 },
          kind: 'throw',
          type: 'Error',
          nearestCatch: null,
        },
      ],
      config: [
        {
          location: { path: 'src/a.ts', startLine: 2, endLine: 2 },
          kind: 'config-read',
          detail: 'reads PORT',
        },
      ],
    }),
    signals: buildMockRiskSignals({ changedLines: 500 }),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: 'Add the port.',
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect([
    route.depth,
    route.lenses,
    route.calls.map((call) => [call.callID, call.lenses, call.effort]),
  ]).toStrictEqual([
    'standard',
    ['correctness', 'failure-handling-and-observability', 'deploy-and-config', 'intent'],
    [
      ['correctness', ['correctness', 'failure-handling-and-observability'], 'medium'],
      ['intent', ['intent'], 'medium'],
      ['platform', ['deploy-and-config'], 'medium'],
    ],
  ]);
});

test('it fires the naming lens on a type claim the change adds', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile()],
      excluded: [],
    },
    slices: buildMockSlices({
      typeClaims: [
        {
          location: { path: 'src/a.ts', startLine: 3, endLine: 3 },
          kind: 'cast-disable',
          detail: 'disables typescript/consistent-type-assertions',
        },
      ],
    }),
    signals: buildMockRiskSignals(),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect(route.lenses).toStrictEqual(['correctness', 'naming-shape-and-comments']);
});

test('it fires the naming lens on a new script that nothing runs', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile()],
      excluded: [],
    },
    slices: buildMockSlices({ scripts: ['scripts/codemod/rename-imports.ts'] }),
    signals: buildMockRiskSignals(),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect(route.lenses).toStrictEqual(['correctness', 'naming-shape-and-comments']);
});

test('it runs a marked risk class at Deep with the lenses it forces, one call per group', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile({ path: 'src/auth/session.ts', addedLines: 120 })],
      excluded: [],
    },
    slices: buildMockSlices({
      throws: [
        {
          location: { path: 'src/auth/session.ts', startLine: 4, endLine: 4 },
          kind: 'throw',
          type: 'Error',
          nearestCatch: null,
        },
      ],
    }),
    signals: buildMockRiskSignals({ riskClasses: ['auth'] }),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect([
    route.depth,
    route.calls.map((call) => [call.callID, call.lenses, call.effort]),
  ]).toStrictEqual([
    'deep',
    [
      ['correctness', ['correctness', 'failure-handling-and-observability'], 'high'],
      ['security', ['security'], 'high'],
    ],
  ]);
});

test('it keeps a lens the config turns off unless a risk class forces it', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile()],
      excluded: [],
    },
    slices: buildMockSlices({
      security: [
        {
          location: { path: 'src/a.ts', startLine: 1, endLine: 3 },
          part: 'allow-deny-check',
          detail: 'canEdit decides access',
        },
      ],
      throws: [
        {
          location: { path: 'src/a.ts', startLine: 2, endLine: 2 },
          kind: 'catch',
          type: null,
          nearestCatch: null,
        },
      ],
    }),
    signals: buildMockRiskSignals({ riskClasses: ['auth'] }),
    config: {
      ...BUILT_IN_DEFAULTS,
      lenses: {
        security: { enabled: false },
        'failure-handling-and-observability': { enabled: false },
      },
    },
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect(route.lenses).toStrictEqual(['correctness', 'security']);
});

test('it routes a change of prose alone to the documentation and instructions lenses', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [
        buildMockChangedFile({ path: 'docs/guide.md', kind: 'prose', status: 'added' }),
        buildMockChangedFile({ path: 'AGENTS.md', kind: 'instructions' }),
      ],
      excluded: [],
    },
    slices: buildMockSlices({
      prose: [{ path: 'docs/guide.md', changedLines: 1, isNew: true }],
      instructions: [{ path: 'AGENTS.md', loadedBeside: [] }],
    }),
    signals: buildMockRiskSignals(),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: 'Write the guide.',
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect([route.special, route.lenses]).toStrictEqual([
    'docs-only',
    ['instructions', 'documentation'],
  ]);
});

test.each<{ isSync: boolean; isRelease: boolean; path: string; special: SpecialChange }>([
  { isSync: true, isRelease: false, path: 'vendor/shared.ts', special: 'sync' },
  { isSync: false, isRelease: true, path: 'package.json', special: 'release' },
])('it runs no lens on a $special change', (row) => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [
        buildMockChangedFile({
          path: row.path,
          kind: 'config',
          hunks: [
            {
              oldStart: 3,
              oldLines: 1,
              newStart: 3,
              newLines: 1,
              lines: [
                { kind: 'deleted', text: '  "version": "1.0.0",', oldLine: 3, newLine: null },
                { kind: 'added', text: '  "version": "1.1.0",', oldLine: null, newLine: 3 },
              ],
            },
          ],
        }),
      ],
      excluded: [],
    },
    slices: buildMockSlices(),
    signals: buildMockRiskSignals(),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: row.isSync,
    isRelease: row.isRelease,
    isPush: false,
  });

  expect([route.special, route.lenses, route.calls]).toStrictEqual([row.special, [], []]);
});

test('it marks a direct push and routes it like any change', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile()],
      excluded: [],
    },
    slices: buildMockSlices(),
    signals: buildMockRiskSignals(),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: true,
  });

  expect([route.special, route.lenses]).toStrictEqual(['direct-push', ['correctness']]);
});

test('it runs a lens with a model of its own in a call of its own, at its own effort', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile({ addedLines: 500 })],
      excluded: [],
    },
    slices: buildMockSlices({
      throws: [
        {
          location: { path: 'src/a.ts', startLine: 4, endLine: 4 },
          kind: 'throw',
          type: 'Error',
          nearestCatch: null,
        },
      ],
    }),
    signals: buildMockRiskSignals({ changedLines: 500 }),
    config: {
      ...BUILT_IN_DEFAULTS,
      lenses: {
        'failure-handling-and-observability': { model: 'small', effort: 'high', timeoutMs: 5000 },
      },
    },
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect(
    route.calls.map((call) => [call.callID, call.lenses, call.model, call.effort, call.timeoutMs]),
  ).toStrictEqual([
    ['correctness', ['correctness'], null, 'medium', null],
    [
      'correctness:failure-handling-and-observability',
      ['failure-handling-and-observability'],
      'small',
      'high',
      5000,
    ],
  ]);
});

test('it runs each call once over the whole of a large change across packages', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [
        buildMockChangedFile({ path: 'apps/web/src/a.ts', addedLines: 400 }),
        buildMockChangedFile({ path: 'modules/core/src/b.ts', addedLines: 400 }),
      ],
      excluded: [],
    },
    slices: buildMockSlices(),
    signals: buildMockRiskSignals({ packagesTouched: 2, changedLines: 800 }),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect(
    route.calls.map((call) => [call.callID, call.files.map((file) => file.path)]),
  ).toStrictEqual([['correctness', ['apps/web/src/a.ts', 'modules/core/src/b.ts']]]);
});

test('it runs the documentation lens on a one-line edit to a doc', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile({ path: 'docs/guide.md', kind: 'prose' })],
      excluded: [],
    },
    slices: buildMockSlices({ prose: [{ path: 'docs/guide.md', changedLines: 1, isNew: false }] }),
    signals: buildMockRiskSignals(),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect([route.special, route.lenses]).toStrictEqual(['docs-only', ['documentation']]);
});

test('it keeps a small change with one write and an event out of Light', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile()],
      excluded: [],
    },
    slices: buildMockSlices({
      writes: [
        {
          location: { path: 'src/a.ts', startLine: 1, endLine: 1 },
          call: 'writeFile',
          inTransaction: false,
          eventsBeside: ['emit'],
        },
      ],
    }),
    signals: buildMockRiskSignals(),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect([route.depth, route.lenses]).toStrictEqual([
    'standard',
    ['correctness', 'concurrency-and-data-integrity'],
  ]);
});

test.each([
  { addedLines: 400, depth: 'light' },
  { addedLines: 401, depth: 'standard' },
])('it reviews $addedLines changed lines of code at $depth', (row) => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile({ addedLines: row.addedLines })],
      excluded: [],
    },
    slices: buildMockSlices(),
    signals: buildMockRiskSignals({ changedLines: row.addedLines }),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect(route.depth).toBe(row.depth);
});

test.each([
  { packagesTouched: 2, depth: 'light' },
  { packagesTouched: 3, depth: 'standard' },
  { packagesTouched: 5, depth: 'standard' },
  { packagesTouched: 6, depth: 'deep' },
])('it reviews a small change across $packagesTouched packages at $depth', (row) => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile()],
      excluded: [],
    },
    slices: buildMockSlices(),
    signals: buildMockRiskSignals({ packagesTouched: row.packagesTouched }),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect(route.depth).toBe(row.depth);
});

test('it keeps a one-line infra change out of Light', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile({ path: 'Dockerfile', kind: 'infra' })],
      excluded: [],
    },
    slices: buildMockSlices(),
    signals: buildMockRiskSignals(),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect(route.depth).toBe('standard');
});

test('it reviews a marked risk class with few lines in its paths at Standard with its lenses', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [
        buildMockChangedFile({ path: 'src/auth/session.ts', addedLines: 99 }),
        buildMockChangedFile({ path: 'src/a.ts', addedLines: 200 }),
      ],
      excluded: [],
    },
    slices: buildMockSlices(),
    signals: buildMockRiskSignals({ riskClasses: ['auth'] }),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect([route.depth, route.lenses]).toStrictEqual(['standard', ['correctness', 'security']]);
});

test.each([
  { deletedLines: 49, depth: 'standard' },
  { deletedLines: 50, depth: 'deep' },
])('it reviews $deletedLines deleted lines in a forced path at $depth', (row) => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [
        buildMockChangedFile({
          path: 'migrations/0002.sql',
          addedLines: 0,
          deletedLines: row.deletedLines,
        }),
        buildMockChangedFile({ path: 'src/a.ts', addedLines: 500 }),
      ],
      excluded: [],
    },
    slices: buildMockSlices(),
    signals: buildMockRiskSignals(),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isRelease: false,
    isPush: false,
  });

  expect(route.depth).toBe(row.depth);
});
