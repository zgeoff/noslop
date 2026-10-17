import type { ReviewConfig, ReviewResult } from '@noslop/contract';
import type { CLIContext } from './cli-context';

// runs each reporter the config lists, in order; a failed reporter is logged and the rest still run,
// and the ids of the failed ones come back; a json reporter with no path is left out, because the
// command prints the result to stdout itself
export async function runReporters(
  result: ReviewResult,
  config: ReviewConfig,
  ctx: CLIContext,
): Promise<string[]> {
  const failed: string[] = [];

  for (const id of config.report) {
    const options = config.reporters[id] ?? {};

    if (id === 'json' && options.path === undefined) {
      continue;
    }

    const reporter = ctx.createReporter(id);

    if (reporter === null) {
      ctx.logger.error('the config lists a reporter noslop does not have: {id}', { id });
      failed.push(id);
      continue;
    }

    try {
      await reporter.report(result, { logger: ctx.logger, options });
    } catch (error) {
      ctx.logger.error('the {id} reporter failed: {error}', { id, error });
      failed.push(id);
    }
  }

  return failed;
}
