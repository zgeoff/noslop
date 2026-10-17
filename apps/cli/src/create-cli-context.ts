import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { createClaudeAdapter } from '@noslop/claude';
import { createCodexAdapter } from '@noslop/codex';
import type { Reporter, ReviewAdapter } from '@noslop/contract';
import type { GitHubClient } from '@noslop/github';
import { createGitHubClient, createGitHubReporter, parseGitHubAppEnv } from '@noslop/github';
import { createRunner } from '@noslop/runner';
import { createSQLiteReporter } from '@noslop/sqlite';
import { createWebhookReporter } from '@noslop/webhook';
import type { CLIContext } from './cli-context';
import { createJSONReporter } from './create-json-reporter';

// the context the installed CLI runs in: the real runner, the user's cache and data folders, stdout
// and stderr, and the adapters and reporters noslop ships
export function createCLIContext(env: Readonly<Record<string, string | undefined>>): CLIContext {
  const runner = createRunner();
  const cacheDir = join(resolveXDGDir(env['XDG_CACHE_HOME'], ['.cache']), 'noslop');
  const dataDir = join(resolveXDGDir(env['XDG_DATA_HOME'], ['.local', 'share']), 'noslop');

  const adapters: Record<string, () => ReviewAdapter> = {
    codex: () => createCodexAdapter({ runner }),
    claude: () => createClaudeAdapter({ runner }),
  };

  let client: Promise<GitHubClient> | null = null;

  // one client per run, made on first use, so a command that never calls GitHub needs no App
  const loadGitHubClient = () => {
    client ??= createGitHubClient(parseGitHubAppEnv(env));

    return client;
  };

  const reporters: Record<string, () => Reporter> = {
    json: () => createJSONReporter(writeStdout),
    sqlite: () => createSQLiteReporter(join(dataDir, 'store.sqlite')),
    github: () => createGitHubReporter({ loadClient: loadGitHubClient }),
    webhook: () => createWebhookReporter({ env }),
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
    createReporter: (id) => reporters[id]?.() ?? null,
    loadGitHubClient,
  };
}

// the XDG base directory spec ignores an empty or relative value, so the folder under the home
// directory stands in for it
function resolveXDGDir(value: string | undefined, fallback: readonly string[]): string {
  return value !== undefined && isAbsolute(value) ? value : join(homedir(), ...fallback);
}

function writeStdout(text: string): void {
  process.stdout.write(text);
}
