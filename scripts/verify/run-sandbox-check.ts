import type { SandboxEnv } from './parse-sandbox-env.ts';
import { readOpenRunState } from './read-open-run-state.ts';
import type { RunEndpoints } from './run-endpoints.ts';
import { runNoslop } from './run-noslop.ts';

// Sets the run's check run from the answers to its findings, as the App, with no review. The CLI
// exits 0 whatever the check concludes, so the `check-run` command reads the conclusion.
export async function runSandboxCheck(
  endpoints: RunEndpoints,
  sandbox: SandboxEnv,
): Promise<{ pullRequest: number }> {
  const state = await readOpenRunState(endpoints);

  await runNoslop(
    endpoints,
    ['check', '--pr', String(state.pullRequest), '--repo', `${sandbox.owner}/${sandbox.repo}`],
    { token: sandbox.token, timeoutMs: 120_000 },
  );

  return { pullRequest: state.pullRequest };
}
