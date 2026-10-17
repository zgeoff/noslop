import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';
import { readChange } from './read-change';
import { runStaticStage } from './run-static-stage';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-static-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, runner: createRunner() };
}

test('it slices a changed function with its writes, guards and throws', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/save.ts': 'export const a = 1;\n' } },
    {
      message: 'head',
      files: {
        'src/save.ts': [
          "import { writeFile } from 'node:fs/promises';",
          '',
          'export async function saveAll(items: string[]) {',
          '  if (items.length === 0) {',
          "    throw new Error('empty');",
          '  }',
          '',
          "  await writeFile('a.txt', items.join(','));",
          "  await writeFile('b.txt', 'done');",
          '}',
          '',
        ].join('\n'),
      },
    },
  ]);

  const config = BUILT_IN_DEFAULTS;

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config,
    title: 'feat: save all items',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.functions).toStrictEqual([
    {
      location: { path: 'src/save.ts', startLine: 3, endLine: 10 },
      name: 'saveAll',
      params: ['items'],
      exported: true,
      isNew: true,
      complexity: 2,
      ioCalls: ['writeFile'],
      writes: ['writeFile'],
    },
  ]);

  expect(result.slices.guards).toStrictEqual([
    {
      location: { path: 'src/save.ts', startLine: 4, endLine: 4 },
      kind: 'throw',
      condition: 'items.length === 0',
      origins: [{ name: 'items', origin: 'parameter' }],
    },
  ]);

  expect(result.slices.throws).toStrictEqual([
    {
      location: { path: 'src/save.ts', startLine: 5, endLine: 5 },
      kind: 'throw',
      type: 'Error',
      nearestCatch: null,
    },
  ]);

  expect(
    result.slices.writes.map((write) => [write.location.startLine, write.inTransaction]),
  ).toStrictEqual([
    [8, false],
    [9, false],
  ]);
});

test('it reports a new test with no assertion and a test that repeats another', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    {
      message: 'base',
      files: {
        'src/sum.ts': 'export function sum(a: number, b: number) {\n  return a + b;\n}\n',
        'src/sum.test.ts': [
          "import { expect, test } from 'bun:test';",
          "import { sum } from './sum';",
          '',
          "test('it adds', () => {",
          '  expect(sum(1, 2)).toBe(3);',
          '});',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'head',
      files: {
        'src/sum.test.ts': [
          "import { expect, test } from 'bun:test';",
          "import { sum } from './sum';",
          '',
          "test('it adds', () => {",
          '  expect(sum(1, 2)).toBe(3);',
          '});',
          '',
          "test('it adds again', () => {",
          '  expect(sum(1, 2)).toBe(3);',
          '});',
          '',
          "test('it adds zero', () => {",
          '  sum(0, 0);',
          '});',
          '',
        ].join('\n'),
      },
    },
  ]);

  const config = BUILT_IN_DEFAULTS;

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config,
    title: 'test: sum',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(
    result.findings.map((finding) => [finding.criterion, finding.anchor.startLine, finding.title]),
  ).toStrictEqual([
    ['untested-change', 12, 'Test "it adds zero" asserts nothing'],
    ['duplicate-helper', 8, 'Test "it adds again" repeats another test\'s body'],
  ]);
});

test('it reports a type test on a key the type lacks', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    {
      message: 'head',
      files: {
        'src/a.ts': 'export interface Item {\n  id: string;\n}\n',
        'src/a.test.ts': [
          "import { expectTypeOf, test } from 'bun:test';",
          "import type { Item } from './a';",
          '',
          "test('it has a name', () => {",
          "  expectTypeOf<Item>().toHaveProperty('name');",
          '});',
          '',
        ].join('\n'),
      },
    },
  ]);

  const config = BUILT_IN_DEFAULTS;

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config,
    title: 'feat: item',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.anchor, finding.title])).toStrictEqual([
    [
      { path: 'src/a.test.ts', startLine: 5, endLine: 5 },
      'Type test checks key "name" that Item lacks',
    ],
  ]);
});

test('it reports a new access check whose tests hold no table of refused inputs', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/access.ts': 'export const a = 1;\n' } },
    {
      message: 'head',
      files: {
        'src/access.ts': 'export function canEdit(role: string) {\n  return role === "admin";\n}\n',
        'src/access.test.ts': [
          "import { expect, test } from 'bun:test';",
          "import { canEdit } from './access';",
          '',
          "test('it lets an admin edit', () => {",
          "  expect(canEdit('admin')).toBe(true);",
          '});',
          '',
        ].join('\n'),
      },
    },
  ]);

  const config = BUILT_IN_DEFAULTS;

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config,
    title: 'feat: access',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.anchor.path, finding.title])).toStrictEqual([
    ['src/access.ts', 'New allow-or-deny check has no table of hostile inputs'],
  ]);

  expect(result.signals.riskClasses).toStrictEqual(['auth']);
});

test('it reports a repeated rule and vague wording in an instruction file', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    {
      message: 'base',
      files: {
        'AGENTS.md': '# Rules\n\n- Run the full check before every commit to main.\n',
        'src/AGENTS.md': '# Source\n',
      },
    },
    {
      message: 'head',
      files: {
        'src/AGENTS.md': [
          '# Source',
          '',
          '- Run the full check before every commit to main.',
          '- Prefer small functions.',
          '',
        ].join('\n'),
      },
    },
  ]);

  const config = BUILT_IN_DEFAULTS;

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config,
    title: 'docs: rules',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(
    result.findings.map((finding) => [finding.criterion, finding.anchor.startLine]),
  ).toStrictEqual([
    ['instruction-conflict', 3],
    ['documentation-prose', 4],
  ]);
});

test('it reports an edit to a synced copy, a stray format hunk and a test the body names', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    {
      message: 'base',
      files: {
        'vendor/shared.ts': 'export const shared = 1;\n',
        'src/a.ts': 'export const a = {b: 1};\n',
        'src/c.ts': 'export const c = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        'vendor/shared.ts': 'export const shared = 2;\n',
        'src/a.ts': 'export const a = { b: 1 };\n',
        'src/c.ts': 'export const c = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['vendor/**'] };

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config,
    title: 'fix: c',
    body: 'Adds src/c.test.ts for the new value.',
    linkedIssue: 'Change the value in src/c.ts and vendor/shared.ts.',
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.criterion, finding.title])).toStrictEqual([
    ['intent-mismatch', 'The pull request names src/c.test.ts, which the change does not add'],
    ['intent-mismatch', 'Edit to the synced copy shared.ts'],
    ['intent-mismatch', 'Format-only edit to a.ts, outside the linked issue'],
  ]);
});

test('it treats a change to synced copies alone as a sync and reports no synced edit', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'vendor/shared.ts': 'export const shared = 1;\n' } },
    { message: 'head', files: { 'vendor/shared.ts': 'export const shared = 2;\n' } },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['vendor/**'] };

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config,
    title: 'chore: sync',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect([result.isSync, result.findings]).toStrictEqual([true, []]);
});

test('it reports a version bump a workspace range refuses and a missing bump', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    {
      message: 'base',
      files: {
        'packages/core/package.json': '{\n  "name": "core",\n  "version": "1.2.0"\n}\n',
        'packages/core/src/a.ts': 'export const a = 1;\n',
        'packages/lib/package.json': '{\n  "name": "lib",\n  "version": "0.1.0"\n}\n',
        'packages/lib/src/b.ts': 'export const b = 1;\n',
        'apps/web/package.json':
          '{\n  "name": "web",\n  "private": true,\n  "dependencies": { "core": "^1.2.0", "lib": "^0.1.0" }\n}\n',
      },
    },
    {
      message: 'head',
      files: {
        'packages/core/package.json': '{\n  "name": "core",\n  "version": "2.0.0"\n}\n',
        'packages/lib/src/b.ts': 'export const b = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, versionBump: ['packages/*/src/**'] };

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config,
    title: 'feat!: core 2',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.anchor, finding.title])).toStrictEqual([
    [
      { path: 'packages/core/package.json', startLine: 3, endLine: 3 },
      "Version 2.0.0 of core falls outside a consumer's range",
    ],
    [
      { path: 'packages/lib/package.json', startLine: 3, endLine: 3 },
      'lib changes with no version bump',
    ],
  ]);

  expect(result.signals.breaking).toBe(true);
});

test('it reports a schema bound above the published limit', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/input.ts': 'export const a = 1;\n' } },
    {
      message: 'head',
      files: {
        'src/input.ts': [
          "import { z } from 'zod';",
          '',
          'export const inputSchema = z.object({',
          '  title: z.string().max(500),',
          '});',
          '',
        ].join('\n'),
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, limits: { title: 256 } };

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config,
    title: 'feat: input',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.anchor.startLine, finding.title])).toStrictEqual(
    [[4, 'Schema lets "title" reach 500, above the limit of 256']],
  );
});

test('it shortlists a base function that a new function repeats', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    {
      message: 'base',
      files: {
        'src/format.ts':
          "export function formatUserName(first: string, last: string) {\n  return [first, last].join(' ').trim();\n}\n",
      },
    },
    {
      message: 'head',
      files: {
        'src/profile.ts':
          "export function formatName(first: string, last: string) {\n  return [first, last].join(' ').trim();\n}\n",
      },
    },
  ]);

  const config = BUILT_IN_DEFAULTS;

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config,
    title: 'feat: profile',
    body: '',
    linkedIssue: null,
    cacheDir: join(ctx.dir, 'cache'),
    pastEscapes: [],
  });

  expect(
    result.slices.reuse.map((entry) => [
      entry.function.name,
      entry.candidates.map((candidate) => candidate.name),
    ]),
  ).toStrictEqual([['formatName', ['formatUserName']]]);
});
