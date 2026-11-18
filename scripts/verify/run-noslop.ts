import { join } from 'node:path';
import { createRunner } from '@noslop/runner';
import type { RunResult } from '@noslop/runner';
import { WringerError } from '@wringer/core';
import type { RunEndpoints } from './run-endpoints.ts';

const cliEntry = join(import.meta.dir, '..', '..', 'apps', 'cli', 'src', 'cli.ts');

export interface NoslopRunOptions {
  token: string;
  timeoutMs: number;
}

// Starts the CLI from this worktree's source, in the run's clone, as a user runs it from a clone of
// noslop. It keeps the caller's environment, because the model CLIs find their sign-in through it;
// the CLI drops every NOSLOP_GITHUB_ variable before it starts a model CLI or git.
export async function runNoslop(
  endpoints: RunEndpoints,
  argv: readonly string[],
  options: NoslopRunOptions,
): Promise<RunResult> {
  const result = await createRunner().run(
    [process.execPath, `--config=${endpoints.bunfig}`, cliEntry, ...argv],
    { cwd: endpoints.clone, env: { GH_TOKEN: options.token }, timeoutMs: options.timeoutMs },
  );

  if (result.timedOut) {
    throw new WringerError('timeout', {
      message: `noslop ${argv[0] ?? ''} ran past ${String(options.timeoutMs)} ms`,
    });
  }

  if (result.exitCode !== 0) {
    throw new WringerError('check-failed', {
      message: `noslop ${argv[0] ?? ''} exited ${String(result.exitCode)}: ${result.stderr.trim().slice(-2000)}`,
    });
  }

  return result;
}
