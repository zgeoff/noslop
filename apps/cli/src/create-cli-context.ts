import { homedir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { createClaudeAdapter } from '@noslop/claude';
import { createCodexAdapter } from '@noslop/codex';
import type { ReviewAdapter } from '@noslop/contract';
import { createRunner } from '@noslop/runner';
import { createSQLiteReporter } from '@noslop/sqlite';
import type { CLIContext } from './cli-context';
import { createJSONReporter } from './create-json-reporter';

// the context the installed CLI runs in: the real runner, the user's cache and data folders, stdout
// and stderr, and the adapters and reporters noslop ships
export function createCLIContext(env: Readonly<Record<string, string | undefined>>): CLIContext {
  const runner = createRunner();
  const cacheDir = join(env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache'), 'noslop');
  const dataDir = join(env['XDG_DATA_HOME'] ?? join(homedir(), '.local', 'share'), 'noslop');

  const adapters: Record<string, () => ReviewAdapter> = {
    codex: () => createCodexAdapter({ runner }),
    claude: () => createClaudeAdapter({ runner }),
  };

  return {
    runner,
    cwd: process.cwd(),
    cacheDir,
    dataDir,
    logger: getLogger(['noslop']),
    writeStdout,
    writeStderr: (text) => {
      process.stderr.write(text);
    },
    createAdapter: (id) => {
      const create = adapters[id];

      if (create === undefined) {
        throw new Error(`noslop has no adapter named ${id}; use codex or claude`);
      }

      return create();
    },
    createReporter: (id) => {
      if (id === 'json') {
        return createJSONReporter(writeStdout);
      }

      return id === 'sqlite' ? createSQLiteReporter(join(dataDir, 'store.sqlite')) : null;
    },
  };
}

function writeStdout(text: string): void {
  process.stdout.write(text);
}
