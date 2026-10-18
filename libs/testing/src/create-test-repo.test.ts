import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildChildEnv } from '@noslop/runner';
import { createTestRepo } from './create-test-repo';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-test-repo-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  // a shell whose git never reads the GIT_DIR of a git hook that runs these tests
  return { dir, $: new Bun.$.Shell().env(buildChildEnv(process.env)) };
}

test('it creates one commit per entry and returns their shas in order', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  const log = await ctx.$`git -C ${repo.path} log --format=%H`.text();

  expect(log.trim().split('\n')).toStrictEqual([...repo.commits].toReversed());
});

test('it removes a file whose content is null', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'src/a.ts': null } },
  ]);

  const files = await ctx.$`git -C ${repo.path} ls-files`.text();

  expect(files).toBe('');
});

test('it commits into its own repo when GIT_DIR names another, as inside a git hook', async () => {
  const ctx = await setupTest();

  const outer = join(ctx.dir, 'outer');
  const fixture = join(ctx.dir, 'fixture');

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
