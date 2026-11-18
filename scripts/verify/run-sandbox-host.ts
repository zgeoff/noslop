import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runDirectoryEnv } from './constants.ts';
import { parseSandboxEnv } from './parse-sandbox-env.ts';
import type { Env } from './parse-sandbox-env.ts';
import { readRunState } from './read-run-state.ts';
import { removeSandboxPullRequest } from './remove-sandbox-pull-request.ts';
import type { RunEndpoints } from './run-endpoints.ts';

// The `local` target's launch process. noslop runs no server, so it only sets the run up: it picks
// the run's branch prefix, writes the empty Bun config and prints the ready line. On SIGTERM, from
// `bun verify down`, it closes the run's open pull request and deletes its branches.
async function runSandboxHost(env: Env): Promise<void> {
  const root = env[runDirectoryEnv];

  if (root === undefined || root === '') {
    throw new Error(`${runDirectoryEnv} is not set; \`bun verify up\` sets it`);
  }

  const endpoints: RunEndpoints = {
    root,
    clone: join(root, 'clone'),
    bunfig: join(root, 'empty-bunfig.toml'),
    run: randomBytes(4).toString('hex'),
  };

  await mkdir(endpoints.clone, { recursive: true });

  await Bun.write(endpoints.bunfig, '');

  const keepAlive = setInterval(() => {}, 60_000);

  process.once('SIGTERM', () => {
    clearInterval(keepAlive);
    void removeOpenPullRequest(endpoints, env);
  });

  process.stdout.write(`${JSON.stringify({ event: 'ready', ...endpoints })}\n`);
}

async function removeOpenPullRequest(endpoints: RunEndpoints, env: Env): Promise<void> {
  const state = await readRunState(endpoints);

  if (state === null || state.stage === 'closed') {
    return;
  }

  try {
    await removeSandboxPullRequest(endpoints, parseSandboxEnv(env));
  } catch (error) {
    process.stderr.write(`could not close the run's pull request: ${String(error)}\n`);
  }
}

if (import.meta.main) {
  await runSandboxHost(process.env);
}
