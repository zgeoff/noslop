import { WringerError } from '@wringer/core';
import { createGitHubConnection, parseGitHubAppEnv } from '../../adapters/github/src/index.ts';
import type { GitHubConnection } from '../../adapters/github/src/index.ts';
import type { Env } from './parse-sandbox-env.ts';

// The App's connection, the only one that may read and set the `noslop` check run.
export function createAppConnection(env: Env): Promise<GitHubConnection> {
  const credentials = parseAppCredentials(env);

  if (credentials === null) {
    throw new WringerError('environment', {
      message:
        'set NOSLOP_GITHUB_APP_ID, NOSLOP_GITHUB_APP_PRIVATE_KEY and NOSLOP_GITHUB_APP_INSTALLATION_ID',
      hint: 'Use the keys of an App installed on the sandbox repo, then run `bun verify up --restart`.',
    });
  }

  return createGitHubConnection(credentials);
}

function parseAppCredentials(env: Env) {
  try {
    return parseGitHubAppEnv(env);
  } catch (error) {
    throw new WringerError('environment', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
