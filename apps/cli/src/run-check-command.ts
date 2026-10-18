import type { PullRequestRef } from '@noslop/contract';
import { createGitHubDispositionSource } from '@noslop/github';
import { loadStore, writeDispositions } from '@noslop/sqlite';
import { checkPullRequest } from './check-pull-request';
import type { CLIContext } from './cli-context';
import { getStorePath } from './get-store-path';
import { loadRepoConfig } from './load-repo-config';
import { resolveRepoDir } from './resolve-repo-dir';

export interface CheckValues {
  pr: string;
  repo: string;
  json: boolean;
}

// sets the noslop check run of a pull request again from what GitHub holds, with no new review, and
// records the dispositions in the store; it exits 1 when no noslop review covers the head, and 0
// whatever else the check concludes, since the check run carries the conclusion
export async function runCheckCommand(values: CheckValues, ctx: CLIContext): Promise<number> {
  const number = Number(values.pr);
  const [owner, name] = values.repo.split('/');

  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`--pr takes a pull request number, not ${values.pr}`);
  }

  if (owner === undefined || name === undefined || owner === '' || name === '') {
    throw new Error(`--repo takes owner/name, not ${values.repo}`);
  }

  const pullRequest = { owner, repo: name, number };

  const outcome = await checkPullRequest(pullRequest, ctx.loadGitHubConnection);

  await writePullRequestDispositions(ctx, pullRequest);

  const output = values.json
    ? `${JSON.stringify(outcome, null, 2)}\n`
    : `noslop check: ${outcome.conclusion}, ${outcome.title}\n`;

  ctx.writeStdout(output);

  // the missing review alone fails the command; a reviewed head whose check fails, such as on a failed
  // call or an open finding, exits 0
  if (!outcome.reviewed) {
    ctx.writeStderr('noslop: no noslop review for this commit\n');

    return 1;
  }

  return 0;
}

// the typed replies of the pull request go to the store, so yield and noise per lens count them
async function writePullRequestDispositions(
  ctx: CLIContext,
  pullRequest: PullRequestRef,
): Promise<void> {
  const repoDir = await resolveRepoDir(ctx);
  const loaded = await loadRepoConfig(ctx, repoDir);

  const source = createGitHubDispositionSource({ loadConnection: ctx.loadGitHubConnection });

  const dispositions = await source.readDispositions(
    { pullRequest, head: '', findings: [] },
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  const store = await loadStore(getStorePath(loaded.config, ctx));

  try {
    await writeDispositions(store, `${pullRequest.owner}/${pullRequest.repo}`, dispositions);
  } finally {
    await store.destroy();
  }
}
