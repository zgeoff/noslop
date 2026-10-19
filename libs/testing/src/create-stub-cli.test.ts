import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from '@noslop/runner';
import { createStubCLI } from './create-stub-cli';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-stub-cli-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, runner: createRunner() };
}

test('it records the arguments and stdin, writes the last message and exits as scripted', async () => {
  const ctx = await setupTest();

  const stub = await createStubCLI(ctx.directory, {
    outputFlag: '-o',
    lastMessage: '{"ok":true}',
    stdout: 'events\n',
    stderr: 'warning\n',
    exitCode: 3,
    delayMs: 0,
  });

  const result = await ctx.runner.run(
    [stub.path, 'exec', '-o', join(ctx.directory, 'last.txt'), '-'],
    {
      cwd: ctx.directory,
      stdin: 'the prompt',
    },
  );

  expect([result.exitCode, result.stdout, result.stderr]).toStrictEqual([
    3,
    'events\n',
    'warning\n',
  ]);

  const record = await stub.readRecord();
  const lastMessage = await Bun.file(join(ctx.directory, 'last.txt')).text();

  expect(record).toStrictEqual({
    args: ['exec', '-o', join(ctx.directory, 'last.txt'), '-'],
    stdin: 'the prompt',
  });

  expect(lastMessage).toBe('{"ok":true}');
});

test('it runs from a folder whose path holds a quote', async () => {
  const ctx = await setupTest();

  const directory = join(ctx.directory, "it's here");

  await Bun.write(join(directory, '.keep'), '');

  const stub = await createStubCLI(directory, {
    outputFlag: null,
    lastMessage: null,
    stdout: 'ran\n',
    stderr: '',
    exitCode: 0,
    delayMs: 0,
  });

  const result = await ctx.runner.run([stub.path], { cwd: directory });

  expect([result.exitCode, result.stdout]).toStrictEqual([0, 'ran\n']);
});

test('it writes no last message when the arguments lack the output flag', async () => {
  const ctx = await setupTest();

  const stub = await createStubCLI(ctx.directory, {
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
