import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { createClaudeAdapter } from '@noslop/claude';
import { createCodexAdapter } from '@noslop/codex';
import type { Reporter, ReviewAdapter } from '@noslop/contract';
import { createGitHubReporter } from '@noslop/github';
import { createRunner } from '@noslop/runner';
import { createSQLiteReporter } from '@noslop/sqlite';
import { createWebhookReporter } from '@noslop/webhook';
import cliPackage from '../package.json' with { type: 'json' };
import type { CLIContext } from './cli-context';
import { createGitHubConnectionLoader } from './create-github-connection-loader';
import { createJSONReporter } from './create-json-reporter';
import { makeCommentURLRecorder } from './make-comment-url-recorder';

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

  const github = createGitHubConnectionLoader(env);
  const loadGitHubConnection = github.load;
  const logger = getLogger(['noslop']);

  // a run with no sqlite reporter wrote no finding rows to link, and opening the store would create a
  // file the config never asked for
  const reporters: Record<string, (storePath: string | null) => Reporter> = {
    json: () => createJSONReporter(writeStdout),
    sqlite: () =>
      createSQLiteReporter(join(dataDir, 'store.sqlite'), { version: cliPackage.version }),
    github: (storePath) =>
      createGitHubReporter({
        loadConnection: loadGitHubConnection,
        ...(storePath === null
          ? {}
          : { recordCommentURLs: makeCommentURLRecorder(storePath, logger) }),
      }),
    webhook: () => createWebhookReporter({ env }),
  };

  return {
    runner,
    cwd: process.cwd(),
    cacheDir,
    dataDir,
    logger,
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
    createReporter: (id, storePath) => reporters[id]?.(storePath) ?? null,
    loadGitHubConnection,
    setGitHubAppSlug: github.setAppSlug,
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
