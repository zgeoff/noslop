import type { Reporter, ReviewConfig, ReviewResult } from '@noslop/contract';
import type { CLIContext } from './cli-context';
import { getStorePath } from './get-store-path';

export async function runReporters(
  result: ReviewResult,
  config: ReviewConfig,
  ctx: CLIContext,
  ids: readonly string[] = config.report,
): Promise<string[]> {
  const failed: string[] = [];
  const reporters: Reporter[] = [];
  const storePath = ids.includes('sqlite') ? getStorePath(config, ctx) : null;

  for (const id of ids) {
    if (id === 'json' && config.reporters[id]?.path === undefined) {
      continue;
    }

    const reporter = ctx.createReporter(id, storePath);

    if (reporter === null) {
      ctx.logger.error('the config lists a reporter noslop does not have: {id}', { id });
      failed.push(id);
      continue;
    }

    reporters.push(reporter);
  }

  for (const reporter of reporters) {
    try {
      await reporter.report(result, {
        logger: ctx.logger,
        options: config.reporters[reporter.id] ?? {},
      });
    } catch (error) {
      ctx.logger.error('the {id} reporter failed: {error}', { id: reporter.id, error });
      failed.push(reporter.id);
    }
  }

  return failed;
}
