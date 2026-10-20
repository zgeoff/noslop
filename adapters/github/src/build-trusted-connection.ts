import type { GitHubConnection } from './create-github-connection';

// the connection that trusts the comments of the App the config names by its slug; a token or
// anonymous connection learns the App's login only this way, and a connection made from the App's
// keys refuses a slug that names another App, since its own comments would then hold no state
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
