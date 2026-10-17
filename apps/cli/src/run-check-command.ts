import { runGitHubCheck } from '@noslop/github';
import type { CLIContext } from './cli-context';

export interface CheckValues {
  pr: string;
  repo: string;
  json: boolean;
}

// sets the noslop check run of a pull request again from what GitHub holds, with no new review, so a
// reply in a finding thread passes or fails the check; it exits 0 whatever the check concludes
export async function runCheckCommand(values: CheckValues, ctx: CLIContext): Promise<number> {
  const number = Number(values.pr);
  const [owner, name] = values.repo.split('/');

  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`--pr takes a pull request number, not ${values.pr}`);
  }

  if (owner === undefined || name === undefined || owner === '' || name === '') {
    throw new Error(`--repo takes owner/name, not ${values.repo}`);
  }

  const connection = await ctx.loadGitHubConnection();

  const outcome = await runGitHubCheck(
    connection,
    { owner, repo: name, number },
    { failedReporters: [] },
  );

  const output = values.json
    ? `${JSON.stringify(outcome, null, 2)}\n`
    : `noslop check: ${outcome.conclusion}, ${outcome.title}\n`;

  ctx.writeStdout(output);

  return 0;
}
