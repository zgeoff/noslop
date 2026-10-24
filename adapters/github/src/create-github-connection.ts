import { App } from '@octokit/app';
import { Octokit } from '@octokit/core';
import type { GitHubAppCredentials } from './parse-github-app-env';
import type { Sleep } from './with-server-error-retry';

export type GitHubClient = Octokit;

export type GitHubAuth = 'app' | 'token' | 'anonymous';

export interface GitHubConnection {
  client: GitHubClient;
  auth: GitHubAuth;
  appLogin: string | null;
  sleep: Sleep;
}

export async function createGitHubConnection(
  credentials: GitHubAppCredentials | null,
  token: string | null = null,
  sleep: Sleep = Bun.sleep,
): Promise<GitHubConnection> {
  if (credentials === null) {
    return token === null
      ? { client: new Octokit(), auth: 'anonymous', appLogin: null, sleep }
      : { client: new Octokit({ auth: token }), auth: 'token', appLogin: null, sleep };
  }

  const app = new App({ appId: credentials.appID, privateKey: credentials.privateKey });

  const self = await app.octokit.request('GET /app');
  const client = await app.getInstallationOctokit(credentials.installationID);

  return { client, auth: 'app', appLogin: `${self.data?.slug ?? ''}[bot]`, sleep };
}
