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
        callID: 'L',
        lenses: ['correctness'],
        effort: 'low',
        model: null,
        timeoutMs: null,
        files: [file],
      },
    ],
  });
});

test('it fires each lens whose slice holds an entry and groups them by the default calls', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile({ addedLines: 80 })],
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
    signals: buildMockRiskSignals({ changedLines: 80 }),
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
      ['A', ['correctness', 'failure-handling-and-observability'], 'medium'],
      ['D', ['deploy-and-config'], 'medium'],
      ['E', ['intent'], 'medium'],
    ],
  ]);
});

test('it runs a marked risk class at Deep with the lenses it forces, one call per group', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [buildMockChangedFile({ path: 'src/auth/session.ts' })],
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
      ['A', ['correctness', 'failure-handling-and-observability'], 'high'],
      ['B', ['security'], 'high'],
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
      files: [buildMockChangedFile({ addedLines: 80 })],
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
    signals: buildMockRiskSignals({ changedLines: 80 }),
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
    ['A', ['correctness'], null, 'medium', null],
    [
      'A:failure-handling-and-observability',
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
  ).toStrictEqual([['A', ['apps/web/src/a.ts', 'modules/core/src/b.ts']]]);
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
