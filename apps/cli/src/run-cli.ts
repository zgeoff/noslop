import { cli, define } from 'gunshi';
import type { CLIContext } from './cli-context';
import { runConfigCommand } from './run-config-command';
import { runEvalCommand } from './run-eval-command';
import { runReviewCommand } from './run-review-command';
import { runStoreQueryCommand } from './run-store-query-command';

const JSON_ARG = {
  type: 'boolean',
  description: 'Print the JSON output to stdout and nothing else',
} as const;

// runs one noslop command with the given arguments and returns its exit code; an error the command
// throws prints to stderr and exits 1
export async function runCLI(argv: readonly string[], ctx: CLIContext): Promise<number> {
  let code = 0;

  const run = async (command: () => Promise<number>) => {
    try {
      code = await command();
    } catch (error) {
      ctx.writeStderr(`noslop: ${formatError(error)}\n`);

      code = 1;
    }
  };

  const review = define({
    name: 'review',
    description: 'Review the change between 2 commits of the current repo',
    args: {
      base: { type: 'string', description: 'The commit the change starts from' },
      head: { type: 'string', description: 'The commit to review, HEAD unless given' },
      json: JSON_ARG,
      push: { type: 'boolean', description: 'Review a direct push to the default branch' },
      adapter: { type: 'string', description: 'The model adapter: codex or claude' },
    },
    run: (command) =>
      run(() =>
        runReviewCommand(
          {
            base: command.values.base,
            head: command.values.head,
            json: command.values.json === true,
            push: command.values.push === true,
            adapter: command.values.adapter,
          },
          ctx,
        ),
      ),
  });

  const config = define({
    name: 'config',
    description: 'Print the merged config and the source of each key',
    args: { json: JSON_ARG },
    run: (command) => run(() => runConfigCommand(command.values.json === true, ctx)),
  });

  const evaluate = define({
    name: 'eval',
    description: 'Replay a corpus through the current config and score it per lens',
    args: {
      corpus: { type: 'string', description: 'The corpus folder', required: true },
      limit: { type: 'string', description: 'Replay only the first cases of the corpus' },
      baseline: { type: 'string', description: 'A recorded run to score as the baseline' },
      'noise-floor': {
        type: 'string',
        description: '2 recorded runs of one reviewer, joined by a comma, to compare',
      },
      out: { type: 'string', description: 'The folder the run and its report go to' },
      adapter: { type: 'string', description: 'The model adapter: codex or claude' },
      json: JSON_ARG,
    },
    run: (command) =>
      run(() =>
        runEvalCommand(
          {
            corpus: command.values.corpus,
            limit: command.values.limit,
            baseline: command.values.baseline,
            noiseFloor: command.values['noise-floor'],
            out: command.values.out,
            adapter: command.values.adapter,
            json: command.values.json === true,
          },
          ctx,
        ),
      ),
  });

  const query = define({
    name: 'query',
    description: 'Run a named query on the findings store',
    args: {
      name: { type: 'positional', description: 'The query: yield-by-lens or open-findings' },
      json: JSON_ARG,
    },
    run: (command) =>
      run(() => runStoreQueryCommand(command.values.name, command.values.json === true, ctx)),
  });

  const store = define({
    name: 'store',
    description: 'Read the findings store',
    subCommands: { query },
    run: () => run(() => Promise.reject(new Error('name a store command: query'))),
  });

  const main = define({
    name: 'noslop',
    description: 'Review a pull request that a coding agent wrote',
    run: () =>
      run(() => Promise.reject(new Error('name a command: review, config, eval or store'))),
  });

  // gunshi prints argument errors to stdout and then throws them, so it prints none, and the errors
  // go to stderr here; stdout under --json holds only the JSON output
  try {
    await cli([...argv], main, {
      name: 'noslop',
      version: '0.0.0',
      renderHeader: null,
      renderValidationErrors: null,
      strict: true,
      subCommands: { review, config, eval: evaluate, store },
    });
  } catch (error) {
    ctx.writeStderr(`noslop: ${formatError(error)}\n`);

    return 1;
  }

  return code;
}

function formatError(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors.map((item: unknown) => formatError(item)).join('; ');
  }

  return error instanceof Error ? error.message : String(error);
}
