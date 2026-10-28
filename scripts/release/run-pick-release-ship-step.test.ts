import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPickReleaseShipStep } from './run-pick-release-ship-step';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-pick-release-ship-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it writes the picked ship to the step output', async () => {
  const ctx = await setupTest();

  const output = join(ctx.directory, 'output');
  const writeStdout = mock<(text: string) => void>(() => {});

  const exitCode = await runPickReleaseShipStep({
    env: {
      GITHUB_OUTPUT: output,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_SHA: '7d0e3b1',
      RELEASES_CREATED: 'true',
      RELEASE_OUTPUTS: '{"sha":"7d0e3b1"}',
      CHECKS_RESULT: 'cancelled',
    },
    writeStdout,
    writeStderr: () => {},
  });

  const written = await readFile(output, 'utf8');

  expect(exitCode).toBe(0);
  expect(written).toBe('ship=dispatch\n');
  expect(writeStdout).toHaveBeenCalledExactlyOnceWith('ship=dispatch\n');
});

test('it fails when the step has no output file', async () => {
  const writeStderr = mock<(text: string) => void>(() => {});

  const exitCode = await runPickReleaseShipStep({
    env: { GITHUB_EVENT_NAME: 'push', CHECKS_RESULT: 'success' },
    writeStdout: () => {},
    writeStderr,
  });

  expect(exitCode).toBe(1);

  expect(writeStderr).toHaveBeenCalledExactlyOnceWith(
    'pick-release-ship: GITHUB_OUTPUT is unset\n',
  );
});

test('it fails without an output when the release outputs hold no tagged commit', async () => {
  const ctx = await setupTest();

  const output = join(ctx.directory, 'output');
  const writeStderr = mock<(text: string) => void>(() => {});

  const exitCode = await runPickReleaseShipStep({
    env: {
      GITHUB_OUTPUT: output,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_SHA: '7d0e3b1',
      RELEASES_CREATED: 'true',
      RELEASE_OUTPUTS: '{"tag_name":"@demo/cli@2.0.1"}',
      CHECKS_RESULT: 'success',
    },
    writeStdout: () => {},
    writeStderr,
  });

  const written = await Bun.file(output).exists();

  expect(exitCode).toBe(1);
  expect(written).toBe(false);

  expect(writeStderr).toHaveBeenCalledExactlyOnceWith(
    'pick-release-ship: the release outputs hold no tagged commit: {"tag_name":"@demo/cli@2.0.1"}\n',
  );
});
