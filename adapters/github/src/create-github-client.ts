import { App } from '@octokit/app';
import { Octokit } from '@octokit/core';
import type { GitHubAppCredentials } from './parse-github-app-env';

export type GitHubClient = Octokit;

// a client that acts as the App's installation, with a token that the App's private key mints and
// Octokit refreshes; with no credentials, an anonymous client that reads public repos
export function createGitHubClient(
  credentials: GitHubAppCredentials | null,
): Promise<GitHubClient> {
  if (credentials === null) {
    return Promise.resolve(new Octokit());
  }

  const app = new App({ appId: credentials.appID, privateKey: credentials.privateKey });

  return app.getInstallationOctokit(credentials.installationID);
}
