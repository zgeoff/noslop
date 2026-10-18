import type { GitHubConnection } from '@noslop/github';
import { createGitHubConnection, parseGitHubAppEnv } from '@noslop/github';

// one connection per loader, made on first use, so a command that never calls GitHub needs no App; it
// connects as the App's installation when the environment holds the App's keys
export function makeGitHubConnectionLoader(
  env: Readonly<Record<string, string | undefined>>,
): () => Promise<GitHubConnection> {
  let connection: Promise<GitHubConnection> | null = null;

  return () => {
    connection ??= createGitHubConnection(parseGitHubAppEnv(env));

    return connection;
  };
}
