import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { StubCLIScript } from './run-stub-cli';

export interface StubCLI {
  // the executable to run in place of the real CLI
  path: string;
  readRecord: () => Promise<{ args: string[]; stdin: string }>;
}

const recordSchema = z.strictObject({ args: z.array(z.string()), stdin: z.string() });

// writes an executable in the directory that runs the stub CLI with the script, so a test hands the
// adapter a path where it would name the real CLI
export async function createStubCLI(
  dir: string,
  script: Omit<StubCLIScript, 'recordPath'>,
): Promise<StubCLI> {
  const recordPath = join(dir, 'stub-record.json');
  const scriptPath = join(dir, 'stub-script.json');
  const path = join(dir, 'stub-cli');

  await Bun.write(scriptPath, JSON.stringify({ ...script, recordPath }));

  await Bun.write(
    path,
    `#!/bin/sh\nNOSLOP_STUB_SCRIPT=${formatShellWord(scriptPath)} exec bun ${formatShellWord(join(import.meta.dir, 'run-stub-cli.ts'))} "$@"\n`,
  );

  await chmod(path, 0o755);

  return {
    path,
    readRecord: async () => {
      const record: unknown = await Bun.file(recordPath).json();

      return recordSchema.parse(record);
    },
  };
}

// a single-quoted shell word, with each quote inside it closed, escaped and reopened
function formatShellWord(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}
