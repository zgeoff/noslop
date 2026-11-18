import { createGitHubConnection } from '../../adapters/github/src/index.ts';
import type { SandboxEnv } from './parse-sandbox-env.ts';
import { readOpenRunState } from './read-open-run-state.ts';
import { removeRunBranches } from './remove-run-branches.ts';
import type { RunEndpoints } from './run-endpoints.ts';
import { writeRunState } from './write-run-state.ts';

// Closes the run's pull request and deletes its 2 branches.
export async function removeSandboxPullRequest(
  endpoints: RunEndpoints,
  sandbox: SandboxEnv,
): Promise<{ pullRequest: number }> {
  const state = await readOpenRunState(endpoints);
  const connection = await createGitHubConnection(null, sandbox.token);

  await connection.client.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner: sandbox.owner,
    repo: sandbox.repo,
    pull_number: state.pullRequest,
    state: 'closed',
  });

  await removeRunBranches(connection, sandbox, endpoints);
  await writeRunState(endpoints, { stage: 'closed' });

  return { pullRequest: state.pullRequest };
}
