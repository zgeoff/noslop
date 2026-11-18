import { join } from 'node:path';
import { getRunBranches } from './create-sandbox-pull-request.ts';
import type { SandboxEnv } from './parse-sandbox-env.ts';
import { readOpenRunState } from './read-open-run-state.ts';
import type { RunEndpoints } from './run-endpoints.ts';
import { runGit } from './run-git.ts';
import { sandboxSeed } from './sandbox-seed.ts';
import { writeRunState } from './write-run-state.ts';

// Pushes the commit that restores the rollback and binds the order status to the pull request's
// head, and keeps its sha for the `fixed` answers.
export async function createSandboxFix(
  endpoints: RunEndpoints,
  sandbox: SandboxEnv,
): Promise<{ pullRequest: number; fixSha: string }> {
  const state = await readOpenRunState(endpoints);

  const git = (args: readonly string[]) => runGit(endpoints.clone, args, sandbox.token);

  for (const [path, text] of Object.entries(sandboxSeed.fix.files)) {
    await Bun.write(join(endpoints.clone, path), text);
  }

  await git(['add', '--all']);
  await git(['commit', '--quiet', '--message', sandboxSeed.fix.message]);
  await git(['push', '--quiet', 'origin', getRunBranches(endpoints).head]);

  const fixSha = await git(['rev-parse', 'HEAD']);

  await writeRunState(endpoints, {
    stage: 'fixed',
    pullRequest: state.pullRequest,
    adapter: state.adapter,
    fixSha,
  });

  return { pullRequest: state.pullRequest, fixSha };
}
