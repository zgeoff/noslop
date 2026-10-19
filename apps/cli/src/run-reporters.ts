import type { Reporter, ReporterContext, ReviewConfig, ReviewResult } from '@noslop/contract';
import type { CLIContext } from './cli-context';

export interface ReporterRunOptions {
  // the reporters to run, the config's list unless given
  ids?: readonly string[];
  fixesOnly?: ReporterContext['fixesOnly'];
}

// runs the listed reporters in order, and a reporter that runs last after them, so it sees which ones
// failed; a failed reporter is logged and the rest still run; a json reporter with no path is left
// out, because the command prints the result to stdout itself
export async function runReporters(
  result: ReviewResult,
  config: ReviewConfig,
  ctx: CLIContext,
  options: ReporterRunOptions = {},
): Promise<string[]> {
  const fixesOnly = options.fixesOnly;
  const failed: string[] = [];
  const reporters: Reporter[] = [];

  for (const id of options.ids ?? config.report) {
    if (id === 'json' && config.reporters[id]?.path === undefined) {
      continue;
    }

    const reporter = ctx.createReporter(id);

    if (reporter === null) {
      ctx.logger.error('the config lists a reporter noslop does not have: {id}', { id });
      failed.push(id);
      continue;
    }

    reporters.push(reporter);
  }

  const ordered = [
    ...reporters.filter((reporter) => reporter.runsLast !== true),
    ...reporters.filter((reporter) => reporter.runsLast === true),
  ];

  for (const reporter of ordered) {
    try {
      await reporter.report(result, {
        logger: ctx.logger,
        options: config.reporters[reporter.id] ?? {},
        failedReporters: [...failed],
        ...(fixesOnly === undefined ? {} : { fixesOnly }),
      });
    } catch (error) {
      ctx.logger.error('the {id} reporter failed: {error}', { id: reporter.id, error });
      failed.push(reporter.id);
    }
  }

  return failed;
}
