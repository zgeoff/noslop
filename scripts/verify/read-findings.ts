import { findingListSchema } from '@noslop/contract';
import { WringerError } from '@wringer/core';
import { findFindingsMismatch } from './find-findings-mismatch.ts';
import type { FindingsExpectation } from './find-findings-mismatch.ts';
import type { SandboxEnv } from './parse-sandbox-env.ts';
import { readOpenRunState } from './read-open-run-state.ts';
import type { RunEndpoints } from './run-endpoints.ts';
import { runNoslop } from './run-noslop.ts';

// Lists the pull request's findings with `noslop findings`, the list a merge gate reads, and fails
// when their states differ from the journey's end state.
export async function readFindings(
  endpoints: RunEndpoints,
  sandbox: SandboxEnv,
  expectation: FindingsExpectation,
): Promise<{ pullRequest: number; states: Record<string, number> }> {
  const state = await readOpenRunState(endpoints);

  const result = await runNoslop(
    endpoints,
    [
      'findings',
      '--pr',
      String(state.pullRequest),
      '--repo',
      `${sandbox.owner}/${sandbox.repo}`,
      '--json',
    ],
    { token: sandbox.token, timeoutMs: 120_000 },
  );

  const list = findingListSchema.parse(JSON.parse(result.stdout));

  const states = Object.fromEntries(
    Object.entries(Object.groupBy(list.findings, (finding) => finding.state)).map(
      ([name, items]) => [name, items?.length ?? 0],
    ),
  );

  const data = { pullRequest: state.pullRequest, states };
  const mismatch = findFindingsMismatch(list.findings, expectation);

  if (mismatch !== null) {
    throw new WringerError('check-failed', { message: mismatch, data });
  }

  return data;
}
