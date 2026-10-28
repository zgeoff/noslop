import { expect, mock, test } from 'bun:test';
import type { ProgramResult, RunProgram } from '../run-program.ts';
import { runPublishCLIStep } from './run-publish-cli-step';

test.each([
  { label: 'no package directory', argv: [] },
  { label: '--help', argv: ['--help'] },
  { label: 'a second package directory', argv: ['apps/cli/dist', 'apps/other/dist'] },
])('it fails with the usage for $label', async (row) => {
  const runProgram = mock<RunProgram>(() => ({ exitCode: 0, stdout: '', stderr: '' }));
  const writeStdout = mock<(text: string) => void>(() => {});
  const writeStderr = mock<(text: string) => void>(() => {});

  const exitCode = await runPublishCLIStep(row.argv, {
    env: { PATH: '/usr/bin' },
    runProgram,
    readText: () => Promise.resolve(JSON.stringify({ name: '@demo/cli', version: '2.0.1' })),
    writeStdout,
    writeStderr,
  });

  expect(exitCode).toBe(1);

  expect(writeStderr).toHaveBeenCalledExactlyOnceWith(
    'usage: run-publish-cli-step.ts <package directory>\n',
  );

  expect(runProgram).not.toHaveBeenCalled();
  expect(writeStdout).not.toHaveBeenCalled();
});

test('it publishes the package directory and prints what npm printed', async () => {
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

  const writeStdout = mock<(text: string) => void>(() => {});

  const exitCode = await runPublishCLIStep(['apps/cli/dist'], {
    env: { PATH: '/usr/bin' },
    runProgram,
    readText: () => Promise.resolve(JSON.stringify({ name: '@demo/cli', version: '2.0.1' })),
    writeStdout,
    writeStderr: () => {},
  });

  expect(exitCode).toBe(0);

  expect(writeStdout).toHaveBeenCalledExactlyOnceWith(
    '+ @demo/cli@2.0.1\npublished @demo/cli@2.0.1\n',
  );
});

test('it fails with the publish error when npm refuses the package', async () => {
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

  const writeStderr = mock<(text: string) => void>(() => {});

  const exitCode = await runPublishCLIStep(['apps/cli/dist'], {
    env: { PATH: '/usr/bin' },
    runProgram,
    readText: () => Promise.resolve(JSON.stringify({ name: '@demo/cli', version: '2.0.1' })),
    writeStdout: () => {},
    writeStderr,
  });

  expect(exitCode).toBe(1);

  expect(writeStderr).toHaveBeenCalledExactlyOnceWith(
    'publish-cli: npm publish ./demo-cli-2.0.1.tgz --provenance --access public exited with 1: npm error code E403\n',
  );
});
