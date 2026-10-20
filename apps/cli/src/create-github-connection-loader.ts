import type { GitHubConnection } from '@noslop/github';
import {
  buildTrustedConnection,
  createGitHubConnection,
  parseGitHubAppEnv,
  parseGitHubTokenEnv,
} from '@noslop/github';

export interface GitHubConnectionLoader {
  load: () => Promise<GitHubConnection>;

  // names the App whose comments hold state, from the config; a review sets it once the config loads,
  // since loading the config can itself read GitHub for a `github:` extends
  setAppSlug: (slug: string | null) => void;
}

// one connection per loader, made on first use, so a command that never calls GitHub needs no App; it
// connects as the App's installation when the environment holds the App's keys, else with GH_TOKEN or
// GITHUB_TOKEN, else anonymously
export function createGitHubConnectionLoader(
  env: Readonly<Record<string, string | undefined>>,
): GitHubConnectionLoader {
  let connection: Promise<GitHubConnection> | null = null;
  let appSlug: string | null = null;

  return {
    load: async () => {
      connection ??= createGitHubConnection(parseGitHubAppEnv(env), parseGitHubTokenEnv(env));

      const loaded = await connection;

      return buildTrustedConnection(loaded, appSlug);
    },
    setAppSlug: (slug) => {
      appSlug = slug;
    },
  };
}
