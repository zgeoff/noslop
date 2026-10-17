import type { LoadedConfig } from '@noslop/config';
import { loadConfig } from '@noslop/config';
import { createGitHubFileReader } from '@noslop/github';
import type { CLIContext } from './cli-context';

// the repo's merged config; a `github:` extends reads its file through GitHub
export function loadRepoConfig(ctx: CLIContext, repoDir: string): Promise<LoadedConfig> {
  return loadConfig({
    repoDir,
    readRemoteFile: createGitHubFileReader({ loadConnection: ctx.loadGitHubConnection }),
  });
}
