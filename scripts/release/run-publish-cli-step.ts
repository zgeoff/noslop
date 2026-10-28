import { parseArgs } from 'node:util';
import type { RunProgram } from '../run-program.ts';
import { runProgram } from '../run-program.ts';
import { runCLIPublish } from './publish-cli.ts';

export interface PublishCLIStepOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runProgram: RunProgram;
  readonly readText: (path: string) => Promise<string>;
  readonly writeStdout: (text: string) => void;
  readonly writeStderr: (text: string) => void;
}

const usage = 'usage: run-publish-cli-step.ts <package directory>';

export async function runPublishCLIStep(
  argv: readonly string[],
  options: Readonly<PublishCLIStepOptions>,
): Promise<number> {
  const directory = parseDirectory(argv);

  if (directory === undefined) {
    options.writeStderr(`${usage}\n`);

    return 1;
  }

  try {
    const result = await runCLIPublish({ ...options, directory });

    const outcome = result.published
      ? `published ${result.spec}\n`
      : `skipping ${result.spec}: already published\n`;

    options.writeStdout(result.log + outcome);

    return 0;
  } catch (error) {
    options.writeStderr(`publish-cli: ${error instanceof Error ? error.message : String(error)}\n`);

    return 1;
  }
}

// parseArgs throws on an option the script does not declare, such as --help.
function parseDirectory(argv: readonly string[]): string | undefined {
  try {
    const parsed = parseArgs({ args: [...argv], options: {}, allowPositionals: true });

    return parsed.positionals.length === 1 ? parsed.positionals[0] : undefined;
  } catch {
    return undefined;
  }
}

if (import.meta.main) {
  const exitCode = await runPublishCLIStep(process.argv.slice(2), {
    env: process.env,
    runProgram,
    readText: (path) => Bun.file(path).text(),
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
  });

  process.exit(exitCode);
}
