import { WringerError } from '@wringer/core';
import type { GitHubConnection } from '../../adapters/github/src/index.ts';
import type { SandboxEnv } from './parse-sandbox-env.ts';
import { readOpenRunState } from './read-open-run-state.ts';
import type { RunEndpoints } from './run-endpoints.ts';

export type CheckConclusion = 'success' | 'failure';

// Reads the latest `noslop` check run on the pull request's head through the App's connection: a
// token gets 403 on the check runs API.
export async function readCheckRun(
  endpoints: RunEndpoints,
  sandbox: SandboxEnv,
  appConnection: GitHubConnection,
  expected: CheckConclusion,
): Promise<{ pullRequest: number; headSha: string; conclusion: string }> {
  const state = await readOpenRunState(endpoints);

  const params = { owner: sandbox.owner, repo: sandbox.repo };

  const pull = await appConnection.client.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    ...params,
    pull_number: state.pullRequest,
  });

  const runs = await appConnection.client.request(
    'GET /repos/{owner}/{repo}/commits/{ref}/check-runs',
    { ...params, ref: pull.data.head.sha, check_name: 'noslop', filter: 'latest' },
  );

  const [latest] = runs.data.check_runs.toSorted(
    (left, right) => Number(right.id) - Number(left.id),
  );

  const conclusion = latest === undefined ? 'none' : (latest.conclusion ?? latest.status);
  const data = { pullRequest: state.pullRequest, headSha: pull.data.head.sha, conclusion };

  if (conclusion !== expected) {
    throw new WringerError('check-failed', {
      message: `the noslop check run on ${pull.data.head.sha} is ${conclusion}, not ${expected}`,
      data,
    });
  }

  return data;
}
