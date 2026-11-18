import type { GitHubConnection } from '../../adapters/github/src/index.ts';
import type { SandboxEnv } from './parse-sandbox-env.ts';
import type { RunEndpoints } from './run-endpoints.ts';

// Deletes the run's base and head branches on the sandbox. A branch someone deleted already counts
// as removed.
export async function removeRunBranches(
  connection: GitHubConnection,
  sandbox: SandboxEnv,
  endpoints: RunEndpoints,
): Promise<void> {
  for (const branch of Object.values(getRunBranches(endpoints))) {
    try {
      await connection.client.request('DELETE /repos/{owner}/{repo}/git/refs/{ref}', {
        owner: sandbox.owner,
        repo: sandbox.repo,
        ref: `heads/${branch}`,
      });
    } catch (error) {
      if (!isMissingRef(error)) {
        throw error;
      }
    }
  }
}

export function getRunBranches(endpoints: RunEndpoints): { base: string; head: string } {
  return { base: `verify/${endpoints.run}/base`, head: `verify/${endpoints.run}/head` };
}

function isMissingRef(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error.status === 404 || error.status === 422)
  );
}
