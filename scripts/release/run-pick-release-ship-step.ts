import { appendFile } from 'node:fs/promises';
import { pickReleaseShip } from './pick-release-ship.ts';

export interface PickReleaseShipStepOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly writeStdout: (text: string) => void;
  readonly writeStderr: (text: string) => void;
}

export async function runPickReleaseShipStep(
  options: Readonly<PickReleaseShipStepOptions>,
): Promise<number> {
  const output = options.env['GITHUB_OUTPUT'];

  if (output === undefined) {
    options.writeStderr('pick-release-ship: GITHUB_OUTPUT is unset\n');

    return 1;
  }

  try {
    const ship = pickReleaseShip({
      event: options.env['GITHUB_EVENT_NAME'] ?? '',
      releasesCreated: options.env['RELEASES_CREATED'] ?? '',
      releaseOutputs: options.env['RELEASE_OUTPUTS'] ?? '',
      checksResult: options.env['CHECKS_RESULT'] ?? '',
      sha: options.env['GITHUB_SHA'] ?? '',
    });

    options.writeStdout(`ship=${ship}\n`);

    await appendFile(output, `ship=${ship}\n`);

    return 0;
  } catch (error) {
    options.writeStderr(
      `pick-release-ship: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    return 1;
  }
}

if (import.meta.main) {
  const exitCode = await runPickReleaseShipStep({
    env: process.env,
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
  });

  process.exit(exitCode);
}
