import type { CLIContext } from './cli-context';
import { loadResultFile } from './load-result-file';
import { verifyReviewResult } from './verify-review-result';

export interface VerifyValues {
  file: string;
  json: boolean;
}

export async function runVerifyCommand(values: VerifyValues, ctx: CLIContext): Promise<number> {
  const input = await loadResultFile(ctx, values.file);
  const result = await verifyReviewResult(input, ctx.loadGitHubConnection);

  const pr = result.pullRequest;
  const target = pr === null ? result.repo : `${pr.owner}/${pr.repo}#${pr.number}`;
  const verified = { pullRequest: pr, head: result.head, configHash: result.configHash };

  const output = values.json
    ? `${JSON.stringify(verified, null, 2)}\n`
    : `noslop verify: the result reviews the head ${result.head.slice(0, 12)} of ${target} under the config of its base branch\n`;

  ctx.writeStdout(output);

  return 0;
}
