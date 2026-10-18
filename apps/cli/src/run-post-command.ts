import type { CLIContext } from './cli-context';
import { readResultFile } from './read-result-file';
import { sendReviewResult } from './send-review-result';

export interface PostValues {
  file: string | undefined;

  // false under --no-verify
  verify: boolean;
}

// posts the review result in a file to its pull request as the App; it exits 0 once the result is
// posted, and a result that does not verify exits 1 with nothing posted
export async function runPostCommand(values: PostValues, ctx: CLIContext): Promise<number> {
  const input = await readResultFile(ctx, values.file);

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
