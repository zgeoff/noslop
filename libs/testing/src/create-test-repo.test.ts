import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildChildEnv } from '@noslop/runner';
import { createTestRepo } from './create-test-repo';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-test-repo-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // a shell whose git never reads the GIT_DIR of a git hook that runs these tests
  return { directory, $: new Bun.$.Shell().env(buildChildEnv(process.env)) };
}

test('it creates one commit per entry and returns their shas in order', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  const log = await ctx.$`git -C ${repo.path} log --format=%H`.text();

  expect(log.trim().split('\n')).toStrictEqual([...repo.commits].toReversed());
});

test('it removes a file whose content is null', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'src/a.ts': null } },
  ]);

  const files = await ctx.$`git -C ${repo.path} ls-files`.text();

  expect(files).toBe('');
});

test('it commits each link as a symlink to its target', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'docs/rules.md': '# Rules\n' },
      links: { 'AGENTS.md': 'docs/rules.md' },
    },
  ]);

  const entry = await ctx.$`git -C ${repo.path} ls-tree HEAD -- AGENTS.md`.text();
  const target = await ctx.$`git -C ${repo.path} cat-file -p HEAD:AGENTS.md`.text();

  expect(entry).toStartWith('120000 blob ');
  expect(target).toBe('docs/rules.md');
});

test('it follows the commit an entry names as its parent', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'branch', files: { 'src/a.ts': 'export const a = 2;\n' } },
    { message: 'side', files: { 'docs/a.md': '# A\n' }, parent: 0 },
  ]);

  const parents =
    await ctx.$`git -C ${repo.path} log -1 --format=%P ${repo.commits[2] ?? ''}`.text();

  expect(parents.trim()).toBe(repo.commits[0] ?? '');
});

test('it merges the commit an entry names into its parent, with both trees', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'branch', files: { 'src/a.ts': 'export const a = 2;\n' } },
    { message: 'side', files: { 'docs/a.md': '# A\n' }, parent: 0 },
    { message: 'merge side', files: { 'src/b.ts': 'export const b = 1;\n' }, parent: 1, merged: 2 },
  ]);

  const parents =
    await ctx.$`git -C ${repo.path} log -1 --format=%P ${repo.commits[3] ?? ''}`.text();

  const files =
    await ctx.$`git -C ${repo.path} ls-tree -r --name-only ${repo.commits[3] ?? ''}`.text();

  expect(parents.trim()).toBe(`${repo.commits[1] ?? ''} ${repo.commits[2] ?? ''}`);
  expect(files.trim().split('\n')).toStrictEqual(['docs/a.md', 'src/a.ts', 'src/b.ts']);
});

test('it commits a merge whose conflict the entry resolves with the resolved file', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'branch', files: { 'src/a.ts': 'export const a = 2;\n' } },
    { message: 'side', files: { 'src/a.ts': 'export const a = 3;\n' }, parent: 0 },
    { message: 'merge side', files: { 'src/a.ts': 'export const a = 5;\n' }, parent: 1, merged: 2 },
  ]);

  const parents =
    await ctx.$`git -C ${repo.path} log -1 --format=%P ${repo.commits[3] ?? ''}`.text();

  const file = await ctx.$`git -C ${repo.path} show ${repo.commits[3] ?? ''}:src/a.ts`.text();

  expect(parents.trim()).toBe(`${repo.commits[1] ?? ''} ${repo.commits[2] ?? ''}`);
  expect(file).toBe('export const a = 5;\n');
});

test('it commits into its own repo when GIT_DIR names another, as inside a git hook', async () => {
  const ctx = await setupTest();

  const outer = join(ctx.directory, 'outer');
  const fixture = join(ctx.directory, 'fixture');

  await ctx.$`git init -q -b main ${outer}`.quiet();
  await ctx.$`git -C ${outer} -c user.email=dev@example.com -c user.name=dev commit -q --allow-empty -m outer`.quiet();

  const script = `import { createTestRepo } from ${JSON.stringify(join(import.meta.dir, 'create-test-repo.ts'))};
await createTestRepo(process.argv[1], [{ message: 'fixture', files: { 'a.txt': 'a\\n' } }]);`;

  const child = Bun.spawn(['bun', '-e', script, fixture], {
    env: { ...process.env, GIT_DIR: join(outer, '.git') },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  await child.exited;

  const outerLog = await ctx.$`git -C ${outer} log --format=%s`.text();
  const outerBare = await ctx.$`git -C ${outer} config --get core.bare`.text();
  const fixtureLog = await ctx.$`git -C ${fixture} log --format=%s`.text();

  expect(outerLog).toBe('outer\n');
  expect(outerBare).toBe('false\n');
  expect(fixtureLog).toBe('fixture\n');
});
