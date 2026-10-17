import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from '@noslop/runner';
import { createStubCLI } from './create-stub-cli';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-stub-cli-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, runner: createRunner() };
}

test('it records the arguments and stdin, writes the last message and exits as scripted', async () => {
  const ctx = await setupTest();

  const stub = await createStubCLI(ctx.dir, {
    outputFlag: '-o',
    lastMessage: '{"ok":true}',
    stdout: 'events\n',
    stderr: 'warning\n',
    exitCode: 3,
    delayMs: 0,
  });

  const result = await ctx.runner.run([stub.path, 'exec', '-o', join(ctx.dir, 'last.txt'), '-'], {
    cwd: ctx.dir,
    stdin: 'the prompt',
  });

  expect([result.exitCode, result.stdout, result.stderr]).toStrictEqual([
    3,
    'events\n',
    'warning\n',
  ]);

  const record = await stub.readRecord();
  const lastMessage = await Bun.file(join(ctx.dir, 'last.txt')).text();

  expect(record).toStrictEqual({
    args: ['exec', '-o', join(ctx.dir, 'last.txt'), '-'],
    stdin: 'the prompt',
  });

  expect(lastMessage).toBe('{"ok":true}');
});

test('it writes no last message when the arguments lack the output flag', async () => {
  const ctx = await setupTest();

  const stub = await createStubCLI(ctx.dir, {
    outputFlag: '-o',
    lastMessage: '{"ok":true}',
    stdout: '',
    stderr: '',
    exitCode: 0,
    delayMs: 0,
  });

  await ctx.runner.run([stub.path, 'exec'], { cwd: ctx.dir });

  const exists = await Bun.file(join(ctx.dir, 'last.txt')).exists();

  expect(exists).toBe(false);
});
