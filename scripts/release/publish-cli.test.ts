import { expect, mock, test } from 'bun:test';
import type { ProgramResult, RunProgram } from '../run-program.ts';
import { runCLIPublish } from './publish-cli';

test('it packs and publishes a version npm lacks, with provenance', async () => {
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

  const readText = mock(() =>
    Promise.resolve(JSON.stringify({ name: '@demo/cli', version: '2.0.1' })),
  );

  const result = await runCLIPublish({
    directory: '/work/cli/dist',
    env: { PATH: '/usr/bin' },
    runProgram,
    readText,
  });

  expect(result).toStrictEqual({
    published: true,
    spec: '@demo/cli@2.0.1',
    log: '+ @demo/cli@2.0.1\n',
  });

  expect(readText).toHaveBeenCalledExactlyOnceWith('/work/cli/dist/package.json');

  expect(runProgram.mock.calls).toStrictEqual([
    [
      ['npm', 'view', '@demo/cli@2.0.1', 'version'],
      { cwd: '/work/cli/dist', env: { PATH: '/usr/bin' } },
    ],
    [['bun', 'pm', 'pack', '--quiet'], { cwd: '/work/cli/dist', env: { PATH: '/usr/bin' } }],
    [
      ['npm', 'publish', './demo-cli-2.0.1.tgz', '--provenance', '--access', 'public'],
      { cwd: '/work/cli/dist', env: { PATH: '/usr/bin' } },
    ],
  ]);
});

test('it skips a version npm holds already', async () => {
  const answers: Readonly<Record<string, ProgramResult>> = {
    'npm view @demo/cli@2.0.1 version': { exitCode: 0, stdout: '2.0.1\n', stderr: '' },
  };

  const runProgram = mock<RunProgram>(
    (argv) =>
      answers[argv.join(' ')] ?? { exitCode: 127, stdout: '', stderr: 'command not found\n' },
  );

  const result = await runCLIPublish({
    directory: '/work/cli/dist',
    env: { PATH: '/usr/bin' },
    runProgram,
    readText: () => Promise.resolve(JSON.stringify({ name: '@demo/cli', version: '2.0.1' })),
  });

  expect(result).toStrictEqual({ published: false, spec: '@demo/cli@2.0.1', log: '' });
  expect(runProgram).toHaveBeenCalledOnce();
});

test('it fails with npm stderr when the publish fails', () => {
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
    runCLIPublish({
      directory: '/work/cli/dist',
      env: { PATH: '/usr/bin' },
      runProgram,
      readText: () => Promise.resolve(JSON.stringify({ name: '@demo/cli', version: '2.0.1' })),
    }),
  ).rejects.toThrowWithMessage(Error, /npm publish .* exited with 1: npm error code E403/u);
});

test('it refuses a package manifest without a version', () => {
  const runProgram = mock<RunProgram>(() => ({ exitCode: 0, stdout: '', stderr: '' }));

  expect(
    runCLIPublish({
      directory: '/work/cli/dist',
      env: { PATH: '/usr/bin' },
      runProgram,
      readText: () => Promise.resolve(JSON.stringify({ name: '@demo/cli' })),
    }),
  ).rejects.toThrowWithMessage(Error, /holds no name and version/u);
});
