import type { CLIContext } from './cli-context';
import { loadResultFile } from './load-result-file';
import { sendReviewResult } from './send-review-result';

export interface PostValues {
  file: string;

  verify: boolean;
}

export async function runPostCommand(values: PostValues, ctx: CLIContext): Promise<number> {
  const input = await loadResultFile(ctx, values.file);

  const result = await sendReviewResult(
    input,
    { loadConnection: ctx.loadGitHubConnection, logger: ctx.logger },
    values.verify,
  );

  const pr = result.pullRequest;
  const target = pr === null ? result.repo : `${pr.owner}/${pr.repo}#${pr.number}`;

  ctx.writeStdout(`noslop post: posted the review of ${result.head.slice(0, 12)} to ${target}\n`);

  return 0;
}
