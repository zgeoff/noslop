import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProcessRunner } from './create-process-runner';

async function setupTest() {
  const temp = await mkdtemp(join(tmpdir(), 'noslop-app-runner-'));

  onTestFinished(() => rm(temp, { recursive: true, force: true }));

  // the shell prints the folder with its symlinks resolved
  const dir = await realpath(temp);

  return { dir, runner: createProcessRunner() };
}

test('it runs a process in the folder with the given variables and returns its exit code and stderr', async () => {
  const ctx = await setupTest();

  const result = await ctx.runner.run(['sh', '-c', 'echo "$PWD $NOSLOP_PROBE" >&2; exit 3'], {
    cwd: ctx.dir,
    env: { NOSLOP_PROBE: 'set' },
  });

  expect(result).toStrictEqual({ exitCode: 3, stderr: `${ctx.dir} set\n` });
});

test('it starts a child without the variables that point git at another repo', async () => {
  const ctx = await setupTest();

  const result = await ctx.runner.run(['sh', '-c', 'echo "[$GIT_DIR]" >&2'], {
    cwd: ctx.dir,
    env: { GIT_DIR: '/elsewhere/.git' },
  });

  expect(result).toStrictEqual({ exitCode: 0, stderr: '[]\n' });
});
