import { createGitHubConnection } from '../../adapters/github/src/index.ts';
import { getRunBranches } from './create-sandbox-pull-request.ts';
import type { SandboxEnv } from './parse-sandbox-env.ts';
import { readOpenRunState } from './read-open-run-state.ts';
import type { RunEndpoints } from './run-endpoints.ts';
import { writeRunState } from './write-run-state.ts';

// Closes the run's pull request and deletes its 2 branches. A branch someone deleted already counts
// as removed.
export async function removeSandboxPullRequest(
  endpoints: RunEndpoints,
  sandbox: SandboxEnv,
): Promise<{ pullRequest: number }> {
  const state = await readOpenRunState(endpoints);
  const connection = await createGitHubConnection(null, sandbox.token);

  const params = { owner: sandbox.owner, repo: sandbox.repo };

  await connection.client.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
    ...params,
    pull_number: state.pullRequest,
    state: 'closed',
  });

  for (const branch of Object.values(getRunBranches(endpoints))) {
    await connection.client
      .request('DELETE /repos/{owner}/{repo}/git/refs/{ref}', { ...params, ref: `heads/${branch}` })
      .catch((error: unknown) => {
        if (!isMissingRef(error)) {
          throw error;
        }
      });
  }

  await writeRunState(endpoints, { stage: 'closed' });

  return { pullRequest: state.pullRequest };
}

function isMissingRef(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error.status === 404 || error.status === 422)
  );
}
