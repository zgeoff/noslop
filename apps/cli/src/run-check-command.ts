import type { PullRequestRef } from '@noslop/contract';
import { createGitHubDispositionSource } from '@noslop/github';
import { loadStore, writeDispositions } from '@noslop/sqlite';
import cliPackage from '../package.json' with { type: 'json' };
import type { PullRequestCheck } from './check-pull-request';
import { checkPullRequest } from './check-pull-request';
import type { CLIContext } from './cli-context';
import { getStorePath } from './get-store-path';
import { loadRepoConfig } from './load-repo-config';
import { resolveRepoDir } from './resolve-repo-dir';

export interface CheckValues {
  pr: string;
  repo: string;
  json: boolean;
  readOnly: boolean;
}

// sets the noslop check run again from what GitHub holds and records the dispositions in the store,
// exiting 0 whatever the check concludes, since the check run carries it; read-only, it writes
// neither, so the exit code carries the conclusion
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

  const outcome = await checkPullRequest(
    pullRequest,
    { load: ctx.loadGitHubConnection, setAppSlug: ctx.setGitHubAppSlug },
    { readOnly: values.readOnly },
  );

  if (!values.readOnly) {
    await writePullRequestDispositions(ctx, pullRequest);
  }

  ctx.writeStdout(formatCheckOutput(outcome, values));

  if (!outcome.reviewed) {
    ctx.writeStderr('noslop: no noslop review for this commit\n');

    return 1;
  }

  return values.readOnly && outcome.conclusion !== 'success' ? 1 : 0;
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

  const store = await loadStore(getStorePath(loaded.config, ctx), {
    version: cliPackage.version,
  });

  try {
    await writeDispositions(
      store,
      `${pullRequest.owner}/${pullRequest.repo}`,
      pullRequest.number,
      dispositions,
    );
  } finally {
    await store.destroy();
  }
}

// a read-only check sets no check run, so its text output carries each line of the check run's
// summary that the title does not hold
function formatCheckOutput(outcome: PullRequestCheck, values: CheckValues): string {
  if (values.json) {
    return `${JSON.stringify(outcome, null, 2)}\n`;
  }

  const details = values.readOnly
    ? outcome.summary.split('\n').filter((line) => line !== '' && line !== outcome.title)
    : [];

  return [`noslop check: ${outcome.conclusion}, ${outcome.title}`, ...details]
    .map((line) => `${line}\n`)
    .join('');
}
