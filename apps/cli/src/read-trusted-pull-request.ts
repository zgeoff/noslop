import type { LoadedConfig } from '@noslop/config';
import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection, PullRequestState } from '@noslop/github';
import { readPullRequestBase, readPullRequestState } from '@noslop/github';
import type { CLIContext } from './cli-context';
import { loadRepoConfig } from './load-repo-config';

export interface TrustedPullRequest {
  config: LoadedConfig;
  connection: GitHubConnection;
  state: PullRequestState;
}

// the reads of one pull request whose base branch moves between them before the review gives up
const MAX_BASE_READS = 3;

// the base branch's config names the App whose comments hold state, so it loads before the comments
// are read, and a config the pull request edits cannot name its own App; a base that moves between
// the two reads reads both again, so the config and the reviewed diff come from one base
export async function readTrustedPullRequest(
  ctx: CLIContext,
  repoDir: string,
  pullRequest: PullRequestRef,
  attempt = 1,
): Promise<TrustedPullRequest> {
  const untrusted = await ctx.loadGitHubConnection();
  const configCommit = await readPullRequestBase(untrusted, pullRequest);

  await ctx.runner.run(['git', 'fetch', '--quiet', 'origin', configCommit], { cwd: repoDir });

  const config = await loadRepoConfig(ctx, repoDir, { commit: configCommit });

  ctx.setGitHubAppSlug(config.config.github.app);

  const connection = await ctx.loadGitHubConnection();
  const state = await readPullRequestState(connection, pullRequest);

  if (state.baseSha === configCommit) {
    return { config, connection, state };
  }

  if (attempt >= MAX_BASE_READS) {
    throw new Error(
      `the base branch of the pull request moved during each of ${MAX_BASE_READS} reads; review it again once the base branch holds still`,
    );
  }

  return readTrustedPullRequest(ctx, repoDir, pullRequest, attempt + 1);
}
