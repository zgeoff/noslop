import type { GitHubConnection } from './create-github-connection';

export function buildTrustedConnection(
  connection: GitHubConnection,
  appSlug: string | null,
): GitHubConnection {
  if (appSlug === null) {
    return connection;
  }

  const appLogin = `${appSlug}[bot]`;

  if (connection.auth === 'app' && connection.appLogin !== appLogin) {
    throw new Error(
      `github.app names the App ${appSlug}, but the App's keys belong to ${connection.appLogin ?? 'no App'}; set github.app to the slug of the App that posts the reviews`,
    );
  }

  return { ...connection, appLogin };
}
