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
    isPush: false,
    packageDirs: ['.'],
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
    isPush: false,
    packageDirs: ['.'],
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

test('it runs a marked risk class at Deep with the lenses it forces and call A split', () => {
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
    isPush: false,
    packageDirs: ['.'],
  });

  expect([route.depth, route.calls.map((call) => [call.callID, call.effort])]).toStrictEqual([
    'deep',
    [
      ['A:correctness', 'high'],
      ['A:failure-handling-and-observability', 'high'],
      ['B', 'high'],
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
    isPush: false,
    packageDirs: ['.'],
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
    isPush: false,
    packageDirs: ['.'],
  });

  expect([route.special, route.lenses]).toStrictEqual([
    'docs-only',
    ['instructions', 'documentation'],
  ]);
});

test.each<[string, boolean, string, SpecialChange]>([
  ['a sync', true, 'vendor/shared.ts', 'sync'],
  ['a release bump', false, 'package.json', 'release'],
])('it runs no lens on %s', (_label, isSync, path, special) => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [
        buildMockChangedFile({
          path,
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
    isSync,
    isPush: false,
    packageDirs: ['.'],
  });

  expect([route.special, route.lenses, route.calls]).toStrictEqual([special, [], []]);
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
    isPush: true,
    packageDirs: ['.'],
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
    isPush: false,
    packageDirs: ['.'],
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

test('it runs each call once per chunk of a large change', () => {
  const route = buildRoute({
    change: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [
        buildMockChangedFile({ path: 'apps/web/src/a.ts', addedLines: 100 }),
        buildMockChangedFile({ path: 'modules/core/src/b.ts', addedLines: 100 }),
      ],
      excluded: [],
    },
    slices: buildMockSlices(),
    signals: buildMockRiskSignals({ packagesTouched: 2, changedLines: 200 }),
    config: BUILT_IN_DEFAULTS,
    linkedIssue: null,
    isSync: false,
    isPush: false,
    packageDirs: ['.', 'apps/web', 'modules/core'],
  });

  expect(
    route.calls.map((call) => [call.callID, call.files.map((file) => file.path)]),
  ).toStrictEqual([
    ['A#1', ['apps/web/src/a.ts']],
    ['A#2', ['modules/core/src/b.ts']],
  ]);
});
