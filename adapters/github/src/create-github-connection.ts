import { App } from '@octokit/app';
import { Octokit } from '@octokit/core';
import type { GitHubAppCredentials } from './parse-github-app-env';

export type GitHubClient = Octokit;

// a client and the login GitHub gives the App's own comments, so noslop reads back only the state its
// own App wrote; with no credentials, an anonymous client that reads public repos and trusts no comment
export interface GitHubConnection {
  client: GitHubClient;
  appLogin: string | null;
}

export async function createGitHubConnection(
  credentials: GitHubAppCredentials | null,
): Promise<GitHubConnection> {
  if (credentials === null) {
    return { client: new Octokit(), appLogin: null };
  }

  const app = new App({ appId: credentials.appID, privateKey: credentials.privateKey });

  const self = await app.octokit.request('GET /app');
  const client = await app.getInstallationOctokit(credentials.installationID);

  return { client, appLogin: `${self.data?.slug ?? ''}[bot]` };
}
