import type { GitHubConnection } from '@noslop/github';
import {
  buildTrustedConnection,
  createGitHubConnection,
  parseGitHubAppEnv,
  parseGitHubTokenEnv,
} from '@noslop/github';

export interface GitHubConnectionLoader {
  load: () => Promise<GitHubConnection>;

  setAppSlug: (slug: string | null) => void;
}

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
