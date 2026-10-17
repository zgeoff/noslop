import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from './create-runner';

async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'noslop-runner-'));
  const dir = await realpath(created);

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, runner: createRunner() };
}

test('it returns the exit status and both output streams', async () => {
  const ctx = await setupTest();

  const result = await ctx.runner.run(['sh', '-c', 'echo out; echo err >&2; exit 3'], {
    cwd: ctx.dir,
  });

  expect(result).toStrictEqual({
    exitCode: 3,
    stdout: 'out\n',
    stderr: 'err\n',
    timedOut: false,
    durationMs: expect.toBeWithin(0, 10_000),
  });
});

test('it passes stdin to the process', async () => {
  const ctx = await setupTest();
  const result = await ctx.runner.run(['cat'], { cwd: ctx.dir, stdin: 'the prompt' });

  expect(result.stdout).toBe('the prompt');
});

test('it runs the process in the working directory', async () => {
  const ctx = await setupTest();
  const result = await ctx.runner.run(['pwd'], { cwd: ctx.dir });

  expect(result.stdout).toBe(`${ctx.dir}\n`);
});

test('it adds the given environment to the inherited one', async () => {
  const ctx = await setupTest();

  const result = await ctx.runner.run(['sh', '-c', 'echo "$NOSLOP_RUNNER_TEST"'], {
    cwd: ctx.dir,
    env: { NOSLOP_RUNNER_TEST: 'set' },
  });

  expect(result.stdout).toBe('set\n');
});

test('it stops a process that runs past its timeout', async () => {
  const ctx = await setupTest();
  const result = await ctx.runner.run(['sleep', '5'], { cwd: ctx.dir, timeoutMs: 50 });

  expect(result).toMatchObject({ timedOut: true, durationMs: expect.toBeWithin(0, 2000) });
});

test('it stops the children of a process that runs past its timeout', async () => {
  const ctx = await setupTest();

  const result = await ctx.runner.run(['sh', '-c', 'sleep 5 & wait'], {
    cwd: ctx.dir,
    timeoutMs: 50,
  });

  expect(result).toMatchObject({ timedOut: true, durationMs: expect.toBeWithin(0, 2000) });
});

test('it rejects a binary that does not exist', async () => {
  const ctx = await setupTest();

  expect(ctx.runner.run(['noslop-no-such-binary'], { cwd: ctx.dir })).rejects.toThrow();
});
