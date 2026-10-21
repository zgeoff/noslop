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
  const directory = await mkdtemp(join(tmpdir(), 'noslop-static-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, runner: createRunner() };
}

test('it slices a changed function with its writes, guards and throws', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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

test('it reports an access check whose body changes when its tests hold no table of refused inputs', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
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
    {
      message: 'head',
      files: {
        'src/access.ts':
          'export function canEdit(role: string) {\n  return role === "admin" || role === "owner";\n}\n',
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
    title: 'feat: owners edit',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(
    result.findings.map((finding) => [
      finding.anchor.path,
      finding.anchor.startLine,
      finding.title,
    ]),
  ).toStrictEqual([['src/access.ts', 1, 'New allow-or-deny check has no table of hostile inputs']]);
});

test('it reports no missing table for a renamed access check whose body stays the same', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/access.ts': 'export function canEdit(role: string) {\n  return role === "admin";\n}\n',
      },
    },
    {
      message: 'head',
      files: {
        'src/access.ts':
          'export function canModify(role: string) {\n  return role === "admin";\n}\n',
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
    title: 'refactor: rename the edit check',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings).toStrictEqual([]);
});

test('it reports no missing table for a renamed one-line access check whose body stays the same', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/access.ts': 'export const canPublish = (role: string) => role === "editor";\n',
      },
    },
    {
      message: 'head',
      files: {
        'src/access.ts': 'export const canRelease = (role: string) => role === "editor";\n',
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
    title: 'refactor: rename the publish check',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings).toStrictEqual([]);
});

test('it reports no missing table for an access check when only the line above it changes', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/access.ts': [
          'export const retryLimit = 3;',
          'export function canArchive(role: string) {',
          '  return role === "keeper";',
          '}',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'head',
      files: {
        'src/access.ts': [
          'export function canArchive(role: string) {',
          '  return role === "keeper";',
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
    title: 'refactor: drop the retry limit',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.security.map((entry) => entry.location)).toStrictEqual([
    { path: 'src/access.ts', startLine: 1, endLine: 3 },
  ]);

  expect(result.findings).toStrictEqual([]);
});

test('it reports no missing table for a deny guard when only the line above it changes', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/archive.ts': [
          'export function archiveBoard(member: { admin: boolean }) {',
          "  console.info('archiving');",
          "  if (!member.admin) throw new Error('forbidden');",
          '  return true;',
          '}',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'head',
      files: {
        'src/archive.ts': [
          'export function archiveBoard(member: { admin: boolean }) {',
          "  if (!member.admin) throw new Error('forbidden');",
          '  return true;',
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
    title: 'chore: drop the archive log line',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.security.map((entry) => [entry.part, entry.location])).toStrictEqual([
    ['allow-deny-check', { path: 'src/archive.ts', startLine: 2, endLine: 2 }],
  ]);

  expect(result.findings).toStrictEqual([]);
});

test('it reports the changed one of 2 access checks that share a line', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/access.ts':
          'export const canView = () => true; export const canShare = (role: string) => role === "owner";\n',
      },
    },
    {
      message: 'head',
      files: {
        'src/access.ts':
          'export const canView = () => true; export const canShare = (role: string) => role !== "guest";\n',
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
    title: 'feat: let members share',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.body])).toStrictEqual([
    [
      'New allow-or-deny check has no table of hostile inputs',
      'canShare decides access, and no test of this file runs a test.each table over the inputs the check must refuse.',
    ],
  ]);
});

test('it reports an access check whose body changes only in the spaces of a string', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/access.ts':
          'export function canAudit(role: string) {\n  return role === "site lead";\n}\n',
      },
    },
    {
      message: 'head',
      files: {
        'src/access.ts':
          'export function canAudit(role: string) {\n  return role === "sitelead";\n}\n',
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
    title: 'fix: match the audit role',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(
    result.findings.map((finding) => [
      finding.anchor.path,
      finding.anchor.startLine,
      finding.title,
    ]),
  ).toStrictEqual([['src/access.ts', 1, 'New allow-or-deny check has no table of hostile inputs']]);
});

test('it reports a new access check whose body repeats an existing function that decides nothing', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/access.ts':
          'export function isDraft(state: string) {\n  return state === "open";\n}\n',
      },
    },
    {
      message: 'head',
      files: {
        'src/access.ts': [
          'export function isDraft(state: string) {',
          '  return state === "open";',
          '}',
          '',
          'export function canComment(state: string) {',
          '  return state === "open";',
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
    title: 'feat: let open threads take comments',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(
    result.findings.map((finding) => [
      finding.anchor.path,
      finding.anchor.startLine,
      finding.title,
    ]),
  ).toStrictEqual([['src/access.ts', 5, 'New allow-or-deny check has no table of hostile inputs']]);
});

test('it reports a copy of an existing access check under a new name', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/access.ts': 'export function canPin(role: string) {\n  return role === "mod";\n}\n',
      },
    },
    {
      message: 'head',
      files: {
        'src/access.ts': [
          'export function canPin(role: string) {',
          '  return role === "mod";',
          '}',
          '',
          'export function canLock(role: string) {',
          '  return role === "mod";',
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
    title: 'feat: let mods lock threads',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(
    result.findings.map((finding) => [
      finding.anchor.path,
      finding.anchor.startLine,
      finding.title,
    ]),
  ).toStrictEqual([['src/access.ts', 5, 'New allow-or-deny check has no table of hostile inputs']]);
});

test('it reports a repeated rule and vague wording in an instruction file', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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

test('it reports no synced edit in a pull request a sync author opened beside other files', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'vendor/shared.ts': 'export const shared = 1;\n',
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        'vendor/shared.ts': 'export const shared = 2;\n',
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = {
    ...BUILT_IN_DEFAULTS,
    synced: ['vendor/**'],
    syncAuthors: ['mirror-bot[bot]'],
  };

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
    author: 'mirror-bot[bot]',
  });

  expect(result.isSync).toBe(false);
  expect(result.findings.map((finding) => finding.title)).toStrictEqual([]);
});

test('it reports the synced edit in a pull request an author outside the sync authors opened', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'vendor/shared.ts': 'export const shared = 1;\n',
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        'vendor/shared.ts': 'export const shared = 2;\n',
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = {
    ...BUILT_IN_DEFAULTS,
    synced: ['vendor/**'],
    syncAuthors: ['mirror-bot[bot]'],
  };

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
    title: 'fix: a',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
    author: 'feature-author',
  });

  expect(result.findings.map((finding) => finding.title)).toStrictEqual([
    'Edit to the synced copy shared.ts',
  ]);
});

test('it reports no synced edit when a synced caller only moves the ref of its workflow call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v2',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v3',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [],
  );
});

test('it reports no synced edit when a synced caller only moves a single-quoted ref', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          "    uses: 'example/shared-ci/.github/workflows/checks.yml@release-v2'",
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          "    uses: 'example/shared-ci/.github/workflows/checks.yml@release-v3'",
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [],
  );
});

test('it reports no synced edit when a synced caller moves the ref of a call that keeps its comment', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v2 # keep',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v3 # keep',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [],
  );
});

test('it reports a synced edit when a synced caller changes the comment on its workflow call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v2 # keep',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v3 # changed',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [['Edit to the synced copy checks.yml', 3]],
  );
});

test('it reports a synced edit when a synced caller that fails to parse only moves the ref of its workflow call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v2',
          '    with: [unclosed',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v3',
          '    with: [unclosed',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [['Edit to the synced copy checks.yml', 3]],
  );
});

test('it reports a synced edit when a synced caller moves a ref written inside a block scalar', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v2',
          '    with:',
          '      notes: |',
          '        uses: example/shared-ci/.github/workflows/checks.yml@release-v2',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v2',
          '    with:',
          '      notes: |',
          '        uses: example/shared-ci/.github/workflows/checks.yml@release-v3',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [['Edit to the synced copy checks.yml', 6]],
  );
});

test('it reports a synced edit when a synced caller moves the ref of a step', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    steps:',
          '      - uses: example/shared-ci/.github/workflows/checks.yml@release-v2',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    steps:',
          '      - uses: example/shared-ci/.github/workflows/checks.yml@release-v3',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [['Edit to the synced copy checks.yml', 4]],
  );
});

test('it reports a synced edit when a synced file outside the workflow folder only moves the ref of a call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'ci/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v2',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        'ci/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v3',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['ci/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [['Edit to the synced copy checks.yml', 3]],
  );
});

test('it reports a synced edit when a synced doc only moves the ref of a call in its example', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'docs/ci.md': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v2',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        'docs/ci.md': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v3',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['docs/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [['Edit to the synced copy ci.md', 3]],
  );
});

test('it reports no synced edit when a synced caller only moves a quoted ref that holds a #', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: "example/shared-ci/.github/workflows/checks.yml@release#1"',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: "example/shared-ci/.github/workflows/checks.yml@release#2"',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [],
  );
});

test('it reports no synced edit when a synced caller only moves a bare ref that holds a #', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release#1',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release#2',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [],
  );
});

test('it reports a synced edit when a synced caller changes more than the ref of its workflow call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v2',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v3',
          '    with:',
          '      scripts: lint',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [['Edit to the synced copy checks.yml', 3]],
  );
});

test('it reports a synced edit when a synced caller changes the workflow its call names', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v2',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/other.yml@release-v2',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [['Edit to the synced copy checks.yml', 3]],
  );
});

test('it reports a synced edit when a synced file only moves the ref of an action', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/checkout@v5',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/checkout@v6',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.title, finding.anchor.startLine])).toStrictEqual(
    [['Edit to the synced copy checks.yml', 3]],
  );
});

test('it reports no missing test that the pull request body names when a merge from the base branch brings it in', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/main.ts': 'export const main = 1;\n' } },
    { message: 'Raise the value', files: { 'src/main.ts': 'export const main = 2;\n' } },
    {
      message: 'Test the value',
      files: {
        'src/main.test.ts': [
          "import { expect, test } from 'bun:test';",
          "import { main } from './main';",
          '',
          "test('it exports a value', () => {",
          '  expect(main).toBeNumber();',
          '});',
          '',
        ].join('\n'),
      },
      parent: 0,
    },
    {
      message: 'Merge main and raise the value again',
      files: { 'src/main.ts': 'export const main = 3;\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[2] ?? '',
    config: BUILT_IN_DEFAULTS,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config: BUILT_IN_DEFAULTS,
    title: 'Raise the value',
    body: 'Raises the value that src/main.test.ts checks.',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings).toStrictEqual([]);
});

test('it reports no missing test that the pull request body names with a ./ prefix', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/main.ts': 'export const main = 1;\n' } },
    {
      message: 'Test the value',
      files: {
        'src/main.test.ts': [
          "import { expect, test } from 'bun:test';",
          "import { main } from './main';",
          '',
          "test('it exports a value', () => {",
          '  expect(main).toBeNumber();',
          '});',
          '',
        ].join('\n'),
      },
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config: BUILT_IN_DEFAULTS,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config: BUILT_IN_DEFAULTS,
    title: 'Test the value',
    body: 'Adds `./src/main.test.ts`.',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings).toStrictEqual([]);
});

test('it reports no missing test for a glob that the pull request body names', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/main.ts': 'export const main = 1;\n' } },
    { message: 'Raise the value', files: { 'src/main.ts': 'export const main = 2;\n' } },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config: BUILT_IN_DEFAULTS,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config: BUILT_IN_DEFAULTS,
    title: 'Raise the value',
    body: 'Passes `src/*/index.test.ts`, `src/[ab]/main.test.ts` and `*.e2e.test.ts`.',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings).toStrictEqual([]);
});

test('it reports no missing test for a fixture whose name only starts like a test file', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/main.ts': 'export const main = 1;\n' } },
    { message: 'Raise the value', files: { 'src/main.ts': 'export const main = 2;\n' } },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config: BUILT_IN_DEFAULTS,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config: BUILT_IN_DEFAULTS,
    title: 'Raise the value',
    body: 'Keeps the values in fixtures/main.test.json.',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings).toStrictEqual([]);
});

test('it reports no missing test that an earlier commit of the pull request renames to the name the body gives', async () => {
  const ctx = await setupTest();

  const testText = [
    "import { expect, test } from 'bun:test';",
    "import { main } from './main';",
    '',
    "test('it exports a value', () => {",
    '  expect(main).toBeNumber();',
    '});',
    '',
  ].join('\n');

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/main.ts': 'export const main = 1;\n', 'src/old.test.ts': testText },
    },
    {
      message: 'Rename the test',
      files: { 'src/old.test.ts': null, 'src/main.test.ts': testText },
    },
    { message: 'Raise the value', files: { 'src/main.ts': 'export const main = 2;\n' } },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    config: BUILT_IN_DEFAULTS,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config: BUILT_IN_DEFAULTS,
    title: 'Raise the value',
    body: 'Moves the test from src/old.test.ts to src/main.test.ts and raises the value.',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings).toStrictEqual([]);
});

test('it reports no missing test for a test file at the head that the body only says passes', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/main.ts': 'export const main = 1;\n',
        'src/main.test.ts': [
          "import { expect, test } from 'bun:test';",
          "import { main } from './main';",
          '',
          "test('it exports a value', () => {",
          '  expect(main).toBeNumber();',
          '});',
          '',
        ].join('\n'),
      },
    },
    { message: 'Raise the value', files: { 'src/main.ts': 'export const main = 2;\n' } },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config: BUILT_IN_DEFAULTS,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config: BUILT_IN_DEFAULTS,
    title: 'Raise the value',
    body: 'Raises the value. One rerun cleared `src/main.test.ts`, and "it adds a case" in src/main.test.ts passes for the changed files.',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings).toStrictEqual([]);
});

test.each([
  ['Raises the value. Adds a case for the new value to `src/main.test.ts`.'],
  ['Raises the value. Updated `src/main.test.ts` with a new case.'],
  ['Raises the value. A new case was written in src/main.test.ts.'],
  ['Raises the value. Adds a regression case to\nsrc/main.test.ts.'],
])(
  'it reports a missing test for a test file at the head that the body "%s" claims',
  async (body) => {
    const ctx = await setupTest();

    const repo = await createTestRepo(join(ctx.directory, 'repo'), [
      {
        message: 'base',
        files: {
          'src/main.ts': 'export const main = 1;\n',
          'src/main.test.ts': [
            "import { expect, test } from 'bun:test';",
            "import { main } from './main';",
            '',
            "test('it exports a value', () => {",
            '  expect(main).toBeNumber();',
            '});',
            '',
          ].join('\n'),
        },
      },
      { message: 'Raise the value', files: { 'src/main.ts': 'export const main = 2;\n' } },
    ]);

    const change = await readChange({
      runner: ctx.runner,
      repoDir: repo.path,
      base: 'HEAD~1',
      head: 'HEAD',
      config: BUILT_IN_DEFAULTS,
    });

    const result = await runStaticStage({
      runner: ctx.runner,
      repoDir: repo.path,
      change,
      config: BUILT_IN_DEFAULTS,
      title: 'Raise the value',
      body,
      linkedIssue: null,
      cacheDir: null,
      pastEscapes: [],
    });

    expect(result.findings.map((finding) => [finding.criterion, finding.title])).toStrictEqual([
      ['intent-mismatch', 'The pull request names src/main.test.ts, which the change does not add'],
    ]);
  },
);

test('it reports no missing test for a test file the pull request deletes', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/main.ts': 'export const main = 1;\n',
        'src/obsolete.test.ts': [
          "import { expect, test } from 'bun:test';",
          "import { main } from './main';",
          '',
          "test('it exports a value', () => {",
          '  expect(main).toBeNumber();',
          '});',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'Drop the obsolete test',
      files: { 'src/main.ts': 'export const main = 2;\n', 'src/obsolete.test.ts': null },
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config: BUILT_IN_DEFAULTS,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config: BUILT_IN_DEFAULTS,
    title: 'Drop the obsolete test',
    body: 'Raises the value and removes src/obsolete.test.ts.',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings).toStrictEqual([]);
});

test('it reports no missing test that the pull request adds before a merge from the base branch', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/main.ts': 'export const main = 1;\n' } },
    {
      message: 'Test the value',
      files: {
        'src/main.test.ts': [
          "import { expect, test } from 'bun:test';",
          "import { main } from './main';",
          '',
          "test('it exports a value', () => {",
          '  expect(main).toBeNumber();',
          '});',
          '',
        ].join('\n'),
      },
    },
    { message: 'Add a helper', files: { 'src/other.ts': 'export const other = 1;\n' }, parent: 0 },
    {
      message: 'Merge main and raise the value',
      files: { 'src/main.ts': 'export const main = 2;\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[2] ?? '',
    config: BUILT_IN_DEFAULTS,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config: BUILT_IN_DEFAULTS,
    title: 'Raise the value',
    body: 'Raises the value that src/main.test.ts checks.',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings).toStrictEqual([]);
});

test('it reports a missing test that the pull request body names when no commit of the pull request adds it', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/main.ts': 'export const main = 1;\n' } },
    {
      message: 'Test the value',
      files: {
        'src/main.test.ts': [
          "import { expect, test } from 'bun:test';",
          "import { main } from './main';",
          '',
          "test('it exports a value', () => {",
          '  expect(main).toBeNumber();',
          '});',
          '',
        ].join('\n'),
      },
    },
    { message: 'Add a helper', files: { 'src/other.ts': 'export const other = 1;\n' }, parent: 0 },
    {
      message: 'Merge main and raise the value',
      files: { 'src/main.ts': 'export const main = 2;\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[2] ?? '',
    config: BUILT_IN_DEFAULTS,
  });

  const result = await runStaticStage({
    runner: ctx.runner,
    repoDir: repo.path,
    change,
    config: BUILT_IN_DEFAULTS,
    title: 'Raise the value',
    body: 'Raises the value that ./src/main.test.ts and src/value.test.ts check.',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => [finding.criterion, finding.title])).toStrictEqual([
    ['intent-mismatch', 'The pull request names src/value.test.ts, which the change does not add'],
  ]);
});

test('it reports a synced edit when a synced caller is renamed and only moves the ref of its workflow call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/checks.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v2',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        '.github/workflows/checks.yml': null,
        '.github/workflows/other.yml': [
          'jobs:',
          '  checks:',
          '    uses: example/shared-ci/.github/workflows/checks.yml@release-v3',
          '    with:',
          '      scripts: lint test',
          '',
        ].join('\n'),
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const config = { ...BUILT_IN_DEFAULTS, synced: ['.github/workflows/**'] };

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
    title: 'ci: pin the shared checks',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(
    result.findings.map((finding) => [
      finding.title,
      finding.anchor.path,
      finding.anchor.startLine,
    ]),
  ).toStrictEqual([['Edit to the synced copy other.yml', '.github/workflows/other.yml', 3]]);
});

test('it reports a version bump a workspace range refuses and a missing bump', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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
    cacheDir: join(ctx.directory, 'cache'),
    pastEscapes: [],
  });

  expect(
    result.slices.reuse.map((entry) => [
      entry.function.name,
      entry.candidates.map((candidate) => candidate.name),
    ]),
  ).toStrictEqual([['formatName', ['formatUserName']]]);
});

test('it lists each disable comment the change adds for a cast rule, one entry per comment', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    {
      message: 'head',
      files: {
        'src/order.ts': [
          'interface Order {',
          '  id: string;',
          '}',
          '',
          'export function readOrder(raw: unknown, fallback: unknown): Order[] {',
          '  // oxlint-disable-next-line typescript/consistent-type-assertions -- the queue checks each order',
          '  const first = raw as Order;',
          '  // eslint-disable-next-line local/no-loose-cast -- the fallback comes from a fixed list',
          '  const second = fallback as Order;',
          '',
          '  return [first, second];',
          '}',
          '',
        ].join('\n'),
      },
    },
  ]);

  const config = {
    ...BUILT_IN_DEFAULTS,
    castRules: ['typescript/consistent-type-assertions', 'local/no-loose-cast'],
  };

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
    title: 'feat: read orders',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.typeClaims).toStrictEqual([
    {
      location: { path: 'src/order.ts', startLine: 6, endLine: 6 },
      kind: 'cast-disable',
      detail: 'disables typescript/consistent-type-assertions',
    },
    {
      location: { path: 'src/order.ts', startLine: 8, endLine: 8 },
      kind: 'cast-disable',
      detail: 'disables local/no-loose-cast',
    },
  ]);
});

test('it lists an any type the change adds', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/order.ts':
          'export interface Order {\n  id: string;\n}\n\nexport function saveOrder(order: Order): string {\n  return order.id;\n}\n',
      },
    },
    {
      message: 'head',
      files: {
        'src/import-order.ts': [
          "import { saveOrder } from './order';",
          '',
          'export function importOrder(raw: any): string {',
          '  return saveOrder(raw);',
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
    title: 'feat: import orders',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.typeClaims).toStrictEqual([
    {
      location: { path: 'src/import-order.ts', startLine: 3, endLine: 3 },
      kind: 'any-type',
      detail: 'writes an `any` type',
    },
  ]);
});

test('it lists each JSON.parse call the change adds', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/order.ts': [
          'interface Order {',
          '  id: string;',
          '}',
          '',
          'export function readOrder(text: string): Order {',
          '  return { id: text };',
          '}',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'head',
      files: {
        'src/order.ts': [
          'interface Order {',
          '  id: string;',
          '}',
          '',
          'export function readOrder(text: string): Order {',
          '  return JSON.parse(text);',
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
    title: 'feat: parse orders',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.typeClaims).toStrictEqual([
    {
      location: { path: 'src/order.ts', startLine: 6, endLine: 6 },
      kind: 'any-value',
      detail: 'calls JSON.parse, which returns `any`',
    },
  ]);
});

test('it lists one any value for 2 JSON.parse calls on one added line', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    {
      message: 'head',
      files: {
        'src/pair.ts': [
          'export function readPair(left: string, right: string): [number, number] {',
          '  return [JSON.parse(left), JSON.parse(right)];',
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
    title: 'feat: read a pair',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.typeClaims).toStrictEqual([
    {
      location: { path: 'src/pair.ts', startLine: 2, endLine: 2 },
      kind: 'any-value',
      detail: 'calls JSON.parse, which returns `any`',
    },
  ]);
});

test('it lists no any value for a JSON.parse call the change kept or a typed json reader', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/order.ts': [
          'interface Order {',
          '  id: string;',
          '}',
          '',
          'export function readOrder(text: string): Order {',
          '  return JSON.parse(text);',
          '}',
          '',
          'export function countOrders(): number {',
          '  return 0;',
          '}',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'head',
      files: {
        'src/order.ts': [
          'interface Order {',
          '  id: string;',
          '}',
          '',
          'export function readOrder(text: string): Order {',
          '  return JSON.parse(text);',
          '}',
          '',
          'export function countOrders(): number {',
          '  const reader = { json: (): number => 1 };',
          '',
          '  return reader.json();',
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
    title: 'feat: count orders',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.typeClaims).toStrictEqual([]);
});

test('it lists no type claim for as const, satisfies, another rule or a disable comment the change did not add', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/order.ts': [
          'interface Order {',
          '  id: string;',
          '}',
          '',
          'export function readOrder(raw: unknown): Order {',
          '  // oxlint-disable-next-line typescript/consistent-type-assertions -- the queue checks each order',
          '  const order = raw as Order;',
          '',
          '  return order;',
          '}',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'head',
      files: {
        'src/order.ts': [
          'interface Order {',
          '  id: string;',
          '}',
          '',
          "export const STATES = ['open', 'shut'] as const;",
          '',
          "export const DEFAULT_ORDER = { id: 'none' } satisfies Order;",
          '',
          'export function readOrder(raw: unknown): Order {',
          '  // oxlint-disable-next-line typescript/consistent-type-assertions -- the queue checks each order',
          '  const order = raw as Order;',
          '  // oxlint-disable-next-line no-console -- the operator reads this line',
          '  console.log(order.id);',
          '',
          '  return order;',
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
    title: 'feat: log each order',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.typeClaims).toStrictEqual([]);
});

test('it keeps an access check in the security slice when only its body changes', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/access.ts': 'export function canEdit(role: string) {\n  return role === "admin";\n}\n',
        'src/access.spec.ts': [
          "import { expect, test } from 'bun:test';",
          "import { canEdit } from './access';",
          '',
          "test.each([['guest'], ['']])('it refuses %s', (role) => {",
          '  expect(canEdit(role)).toBe(false);',
          '});',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'head',
      files: {
        'src/access.ts':
          'export function canEdit(role: string) {\n  return role === "admin" || role === "owner";\n}\n',
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
    title: 'feat: owners edit',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.security.map((entry) => [entry.part, entry.location])).toStrictEqual([
    ['allow-deny-check', { path: 'src/access.ts', startLine: 1, endLine: 3 }],
  ]);

  expect(result.findings).toStrictEqual([]);
});

test('it reports no finding for an inherited key, a string change or an unchanged version', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'package.json': '{\n  "name": "root",\n  "private": true\n}\n',
        'packages/core/package.json': '{\n  "name": "core",\n  "version": "2.0.0"\n}\n',
        'apps/web/package.json':
          '{\n  "name": "web",\n  "private": true,\n  "dependencies": { "core": "^1.0.0" }\n}\n',
        'src/a.ts': 'export const a = { b: "x y" };\n',
        'src/item.test.ts': [
          "import { expect, test } from 'bun:test';",
          '',
          "test('it reads ab', () => {",
          "  expect('ab').toBe('ab');",
          '});',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'head',
      files: {
        'src/a.ts': 'export const a = { b: "xy" };\n',
        'src/item.ts':
          'interface Base {\n  id: string;\n}\n\nexport interface Item extends Base {\n  name: string;\n}\n',
        'src/item.test.ts': [
          "import { expect, expectTypeOf, test } from 'bun:test';",
          "import type { Item } from './item';",
          '',
          "test('it reads ab', () => {",
          "  expect('ab').toBe('ab');",
          '});',
          '',
          "test('it reads a b', () => {",
          "  expect('a b').toBe('a b');",
          '});',
          '',
          "test('it has an id', () => {",
          "  expectTypeOf<Item>().toHaveProperty('id');",
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
    linkedIssue: 'Change the value in src/x.ts.',
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings).toStrictEqual([]);
});

test('it anchors a bound on its own line of a chain that spans lines', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/input.ts': [
          "import { z } from 'zod';",
          '',
          'export const inputSchema = z.object({',
          '  title: z',
          '    .string()',
          '    .max(100),',
          '});',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'head',
      files: {
        'src/input.ts': [
          "import { z } from 'zod';",
          '',
          'export const inputSchema = z.object({',
          '  title: z',
          '    .string()',
          '    .max(500),',
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
    title: 'feat: longer titles',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.findings.map((finding) => finding.anchor)).toStrictEqual([
    { path: 'src/input.ts', startLine: 6, endLine: 6 },
  ]);
});

test('it records an edge for a changed interface member and for the exports of a deleted file', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'packages/core/package.json': '{\n  "name": "core",\n  "version": "1.0.0"\n}\n',
        'packages/core/src/item.ts': 'export interface Item {\n  id: string;\n}\n',
        'packages/core/src/old.ts': 'export function readOld() {\n  return 1;\n}\n',
        'apps/web/package.json':
          '{\n  "name": "web",\n  "private": true,\n  "dependencies": { "core": "workspace:*" }\n}\n',
      },
    },
    {
      message: 'head',
      files: {
        'packages/core/src/item.ts': 'export interface Item {\n  id: number;\n}\n',
        'packages/core/src/old.ts': null,
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
    title: 'feat!: numeric ids',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(
    result.slices.edges.map((edge) => [edge.location.path, edge.kind, edge.name]),
  ).toStrictEqual([
    ['packages/core/src/item.ts', 'export', 'Item'],
    ['packages/core/src/old.ts', 'export', 'readOld'],
  ]);
});

test('it lists each script the change adds that no package script and no workflow names', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'package.json':
          '{\n  "name": "shop",\n  "scripts": { "build": "bun scripts/build.ts" }\n}\n',
        'scripts/build.ts': 'console.log("build");\n',
        'src/cart.ts': 'export const cart = 1;\n',
      },
    },
    {
      message: 'head',
      files: {
        'scripts/codemod/rename-imports.ts': "import { walk } from './lib/walk';\n\nwalk('src');\n",
        'scripts/codemod/lib/walk.ts': 'export function walk(root: string) {\n  return root;\n}\n',
        'src/cart.ts': 'export const cart = 2;\n',
        'src/checkout.ts': 'export const checkout = 1;\n',
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
    title: 'refactor: rename the cart imports',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.scripts).toStrictEqual([
    'scripts/codemod/lib/walk.ts',
    'scripts/codemod/rename-imports.ts',
  ]);
});

test('it leaves out a new script that a package script names from its own folder', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'packages/web/package.json': '{\n  "name": "web"\n}\n',
      },
    },
    {
      message: 'head',
      files: {
        'packages/web/package.json':
          '{\n  "name": "web",\n  "scripts": { "seed": "bun ./scripts/seed.ts --demo" }\n}\n',
        'packages/web/scripts/seed.ts': 'console.log("seed");\n',
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
    title: 'feat: seed the demo data',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.scripts).toStrictEqual([]);
});

test('it leaves out a new script that an unchanged workflow names', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        '.github/workflows/release.yml': [
          'on: push',
          'jobs:',
          '  release:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - run: bun scripts/publish.ts',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'head',
      files: {
        'scripts/publish.ts': 'console.log("publish");\n',
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
    title: 'feat: publish the package',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.scripts).toStrictEqual([]);
});

test('it leaves out a new script that a workflow names from its package folder', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'packages/web/package.json': '{\n  "name": "web"\n}\n',
        '.github/workflows/release.yml': [
          'on: push',
          'jobs:',
          '  release:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - run: bun scripts/publish.ts',
          '        working-directory: packages/web',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'head',
      files: {
        'packages/web/scripts/publish.ts': 'console.log("publish");\n',
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
    title: 'feat: publish the web package',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.scripts).toStrictEqual([]);
});

test('it lists a new script that a package script names only inside a longer path', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'package.json':
          '{\n  "name": "shop",\n  "scripts": { "seed": "bun tools/scripts/seed.ts" }\n}\n',
      },
    },
    {
      message: 'head',
      files: {
        'scripts/seed.ts': 'console.log("seed");\n',
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
    title: 'chore: seed the shop',
    body: '',
    linkedIssue: null,
    cacheDir: null,
    pastEscapes: [],
  });

  expect(result.slices.scripts).toStrictEqual(['scripts/seed.ts']);
});
