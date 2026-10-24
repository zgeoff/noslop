import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { StubCLIScript } from './run-stub-cli';

export interface StubCLI {
  path: string;
  readRecord: () => Promise<{ args: string[]; stdin: string }>;
}

const recordSchema = z.strictObject({ args: z.array(z.string()), stdin: z.string() });

export async function createStubCLI(
  directory: string,
  script: Omit<StubCLIScript, 'recordPath'>,
): Promise<StubCLI> {
  const recordPath = join(directory, 'stub-record.json');
  const scriptPath = join(directory, 'stub-script.json');
  const path = join(directory, 'stub-cli');

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

function formatShellWord(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}
