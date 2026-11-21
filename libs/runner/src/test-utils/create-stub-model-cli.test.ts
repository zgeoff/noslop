import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createTempDir } from '@zgeoff/testing/fs';
import { createRunner } from '../index';
import { createStubModelCLI } from './create-stub-model-cli';

function setupTest() {
  const directory = createTempDir('stub-model-cli');

  return { directory: directory.path, runner: createRunner() };
}

test('it records the arguments and stdin, writes the last message and exits as scripted', async () => {
  const ctx = setupTest();

  const stub = createStubModelCLI(ctx.directory, {
    outputFlag: '-o',
    lastMessage: '{"ok":true}',
    stdout: 'events\n',
    stderr: 'warning\n',
    exitCode: 3,
    delayMs: 0,
  });

  const result = await ctx.runner.run(
    [stub.path, 'exec', '-o', join(ctx.directory, 'last.txt'), '-'],
    { cwd: ctx.directory, stdin: 'the prompt' },
  );

  expect([result.exitCode, result.stdout, result.stderr]).toStrictEqual([
    3,
    'events\n',
    'warning\n',
  ]);

  const call = stub.readCall();

  const lastMessage = await Bun.file(join(ctx.directory, 'last.txt')).text();

  expect({ argv: call.argv, stdin: call.stdin }).toStrictEqual({
    argv: ['exec', '-o', join(ctx.directory, 'last.txt'), '-'],
    stdin: 'the prompt',
  });

  expect(lastMessage).toBe('{"ok":true}');
});

test('it runs from a folder whose path holds a quote', async () => {
  const ctx = setupTest();
  const directory = join(ctx.directory, "it's here");

  const stub = createStubModelCLI(directory, {
    outputFlag: null,
    lastMessage: null,
    stdout: "ran 'it'\n",
    stderr: '',
    exitCode: 0,
    delayMs: 0,
  });

  const result = await ctx.runner.run([stub.path], { cwd: ctx.directory });

  expect([result.exitCode, result.stdout]).toStrictEqual([0, "ran 'it'\n"]);
});

test('it writes no last message when the arguments lack the output flag', async () => {
  const ctx = setupTest();

  const stub = createStubModelCLI(ctx.directory, {
    outputFlag: '-o',
    lastMessage: '{"ok":true}',
    stdout: '',
    stderr: '',
    exitCode: 0,
    delayMs: 0,
  });

  await ctx.runner.run([stub.path, 'exec'], { cwd: ctx.directory });

  const exists = await Bun.file(join(ctx.directory, 'last.txt')).exists();

  expect(exists).toBe(false);
});

test('it stops a call that outlasts its timeout', async () => {
  const ctx = setupTest();

  const stub = createStubModelCLI(ctx.directory, {
    outputFlag: null,
    lastMessage: null,
    stdout: '',
    stderr: '',
    exitCode: 0,
    delayMs: 30_000,
  });

  const result = await ctx.runner.run([stub.path], { cwd: ctx.directory, timeoutMs: 300 });

  expect(result.timedOut).toBe(true);
  expect(result.durationMs).toBeLessThan(10_000);
});
