import { App } from '@octokit/app';
import { Octokit } from '@octokit/core';
import type { GitHubAppCredentials } from './parse-github-app-env';
import { SERVER_ERROR_RETRY_DELAYS_MS } from './with-server-error-retry';

export type GitHubClient = Octokit;

// how a client reaches GitHub: as the App's installation, with a token from the environment, or with
// no credential, which reads only public repos
export type GitHubAuth = 'app' | 'token' | 'anonymous';

// a client and the login of the App whose comments hold noslop's state, so noslop reads back only the
// state that App wrote; the App's keys give its login, and with no keys noslop trusts no comment until
// the config names the App; the waits before each retry of a write that GitHub answers with a 5xx
export interface GitHubConnection {
  client: GitHubClient;
  auth: GitHubAuth;
  appLogin: string | null;
  retryDelaysMs: readonly number[];
}

export async function createGitHubConnection(
  credentials: GitHubAppCredentials | null,
  token: string | null = null,
  retryDelaysMs: readonly number[] = SERVER_ERROR_RETRY_DELAYS_MS,
): Promise<GitHubConnection> {
  if (credentials === null) {
    return token === null
      ? { client: new Octokit(), auth: 'anonymous', appLogin: null, retryDelaysMs }
      : { client: new Octokit({ auth: token }), auth: 'token', appLogin: null, retryDelaysMs };
  }

  const app = new App({ appId: credentials.appID, privateKey: credentials.privateKey });

  const self = await app.octokit.request('GET /app');
  const client = await app.getInstallationOctokit(credentials.installationID);

  return { client, auth: 'app', appLogin: `${self.data?.slug ?? ''}[bot]`, retryDelaysMs };
}
