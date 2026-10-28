import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProgramResult, RunProgram } from '../run-program.ts';
import { runCLIPublish } from './publish-cli';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-publish-cli-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it packs and publishes a version npm lacks, with provenance', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ name: '@demo/cli', version: '2.0.1' }),
  );

  const answers: Readonly<Record<string, ProgramResult>> = {
    'npm view @demo/cli@2.0.1 version': {
      exitCode: 1,
      stdout: '',
      stderr: 'npm error code E404\n',
    },
    'bun pm pack --quiet': { exitCode: 0, stdout: 'demo-cli-2.0.1.tgz\n', stderr: '' },
    'npm publish ./demo-cli-2.0.1.tgz --provenance --access public': {
      exitCode: 0,
      stdout: '+ @demo/cli@2.0.1\n',
      stderr: '',
    },
  };

  const runProgram = mock<RunProgram>(
    (argv) =>
      answers[argv.join(' ')] ?? { exitCode: 127, stdout: '', stderr: 'command not found\n' },
  );

  const result = await runCLIPublish({
    directory: ctx.directory,
    env: { PATH: '/usr/bin' },
    runProgram,
  });

  expect(result).toStrictEqual({
    published: true,
    spec: '@demo/cli@2.0.1',
    log: '+ @demo/cli@2.0.1\n',
  });

  expect(runProgram.mock.calls).toStrictEqual([
    [
      ['npm', 'view', '@demo/cli@2.0.1', 'version'],
      { cwd: ctx.directory, env: { PATH: '/usr/bin' } },
    ],
    [['bun', 'pm', 'pack', '--quiet'], { cwd: ctx.directory, env: { PATH: '/usr/bin' } }],
    [
      ['npm', 'publish', './demo-cli-2.0.1.tgz', '--provenance', '--access', 'public'],
      { cwd: ctx.directory, env: { PATH: '/usr/bin' } },
    ],
  ]);
});

test('it skips a version npm holds already', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ name: '@demo/cli', version: '2.0.1' }),
  );

  const answers: Readonly<Record<string, ProgramResult>> = {
    'npm view @demo/cli@2.0.1 version': { exitCode: 0, stdout: '2.0.1\n', stderr: '' },
  };

  const runProgram = mock<RunProgram>(
    (argv) =>
      answers[argv.join(' ')] ?? { exitCode: 127, stdout: '', stderr: 'command not found\n' },
  );

  const result = await runCLIPublish({
    directory: ctx.directory,
    env: { PATH: '/usr/bin' },
    runProgram,
  });

  expect(result).toStrictEqual({ published: false, spec: '@demo/cli@2.0.1', log: '' });
  expect(runProgram).toHaveBeenCalledOnce();
});

test('it fails with npm stderr when the publish fails', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ name: '@demo/cli', version: '2.0.1' }),
  );

  const answers: Readonly<Record<string, ProgramResult>> = {
    'npm view @demo/cli@2.0.1 version': {
      exitCode: 1,
      stdout: '',
      stderr: 'npm error code E404\n',
    },
    'bun pm pack --quiet': { exitCode: 0, stdout: 'demo-cli-2.0.1.tgz\n', stderr: '' },
    'npm publish ./demo-cli-2.0.1.tgz --provenance --access public': {
      exitCode: 1,
      stdout: '',
      stderr: 'npm error code E403\n',
    },
  };

  const runProgram = mock<RunProgram>(
    (argv) =>
      answers[argv.join(' ')] ?? { exitCode: 127, stdout: '', stderr: 'command not found\n' },
  );

  expect(
    runCLIPublish({ directory: ctx.directory, env: { PATH: '/usr/bin' }, runProgram }),
  ).rejects.toThrowWithMessage(Error, /npm publish .* exited with 1: npm error code E403/u);
});

test('it refuses a package manifest without a version', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'package.json'), JSON.stringify({ name: '@demo/cli' }));

  const runProgram = mock((): ProgramResult => ({ exitCode: 0, stdout: '', stderr: '' }));

  expect(
    runCLIPublish({ directory: ctx.directory, env: { PATH: '/usr/bin' }, runProgram }),
  ).rejects.toThrowWithMessage(Error, /holds no name and version/u);
});
