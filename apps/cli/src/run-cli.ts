import { STORE_QUERY_NAMES } from '@noslop/sqlite';
import { cli, define } from 'gunshi';
import cliPackage from '../package.json' with { type: 'json' };
import type { CLIContext } from './cli-context';
import { runCheckCommand } from './run-check-command';
import { runConfigCommand } from './run-config-command';
import { runEvalCommand } from './run-eval-command';
import { runPostCommand } from './run-post-command';
import { runReviewCommand } from './run-review-command';
import { runStoreEscapeCommand } from './run-store-escape-command';
import { runStoreQueryCommand } from './run-store-query-command';
import { runVerifyCommand } from './run-verify-command';

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
      pr: { type: 'string', description: 'Review a pull request, from its base and head' },
      full: {
        type: 'boolean',
        description: 'Review the whole pull request, not only the commits since the last review',
      },
      'fixes-only': {
        type: 'boolean',
        description:
          'Check each fixed answer against the commits since the last review, with no lens and no new finding',
      },
      repo: {
        type: 'string',
        description: 'The pull request repo as owner/name, origin unless given',
      },
      report: {
        type: 'string',
        description: 'The reporters to run, joined by commas, in place of the config',
      },
      json: JSON_ARG,
      push: { type: 'boolean', description: 'Review a direct push to the default branch' },
      adapter: { type: 'string', description: 'The model adapter: codex or claude' },
      'issue-file': {
        type: 'string',
        description:
          'A file whose text is the issue the change closes, in place of the issue the pull request body names',
      },
    },
    run: (command) =>
      run(() =>
        runReviewCommand(
          {
            base: command.values.base,
            head: command.values.head,
            pr: command.values.pr,
            full: command.values.full === true,
            fixesOnly: command.values['fixes-only'] === true,
            repo: command.values.repo,
            report: command.values.report,
            json: command.values.json === true,
            push: command.values.push === true,
            adapter: command.values.adapter,
            issueFile: command.values['issue-file'],
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
      resume: {
        type: 'boolean',
        description: 'Keep the cases the out folder already holds and replay only the rest',
      },
      static: {
        type: 'boolean',
        description: 'Plan each case with no model call and report the depth and calls it gets',
      },
      depth: {
        type: 'string',
        description:
          'Review every case at this depth, light, standard or deep, in place of its own',
      },
      json: JSON_ARG,
    },
    run: (command) =>
      run(() =>
        runEvalCommand(
          {
            static: command.values.static === true,
            depth: command.values.depth,
            corpus: command.values.corpus,
            limit: command.values.limit,
            baseline: command.values.baseline,
            noiseFloor: command.values['noise-floor'],
            out: command.values.out,
            adapter: command.values.adapter,
            json: command.values.json === true,
            resume: command.values.resume === true,
          },
          ctx,
        ),
      ),
  });

  const query = define({
    name: 'query',
    description: 'Run a named query on the findings store',
    args: {
      name: { type: 'positional', description: `The query: ${STORE_QUERY_NAMES.join(', ')}` },
      json: JSON_ARG,
    },
    run: (command) =>
      run(() => runStoreQueryCommand(command.values.name, command.values.json === true, ctx)),
  });

  const escape = define({
    name: 'escape',
    description: 'Record a defect that a review missed',
    args: {
      repo: { type: 'string', description: 'The repo as owner/name', required: true },
      issue: { type: 'string', description: 'The issue that reports the defect', required: true },
      head: {
        type: 'string',
        description: 'The head commit of the change that caused it',
        required: true,
      },
      defect: { type: 'string', description: 'What the defect is', required: true },
      lens: { type: 'string', description: 'The lens that should have found it' },
      path: { type: 'string', description: 'The file that holds it' },
      lines: { type: 'string', description: 'Its line or line range in the file, such as 12-14' },
    },
    run: (command) =>
      run(() =>
        runStoreEscapeCommand(
          {
            repo: command.values.repo,
            issue: command.values.issue,
            head: command.values.head,
            defect: command.values.defect,
            lens: command.values.lens,
            path: command.values.path,
            lines: command.values.lines,
          },
          ctx,
        ),
      ),
  });

  const store = define({
    name: 'store',
    description: 'Read and add to the findings store',
    subCommands: { query, escape },
    run: () => run(() => Promise.reject(new Error('name a store command: query or escape'))),
  });

  const check = define({
    name: 'check',
    description: 'Set the noslop check run of a pull request from its dispositions',
    args: {
      pr: { type: 'string', description: 'The pull request number', required: true },
      repo: { type: 'string', description: 'The repo as owner/name', required: true },
      json: JSON_ARG,
    },
    run: (command) =>
      run(() =>
        runCheckCommand(
          { pr: command.values.pr, repo: command.values.repo, json: command.values.json === true },
          ctx,
        ),
      ),
  });

  const verify = define({
    name: 'verify',
    description:
      'Check a review result against its pull request: its head and the config of its base branch',
    args: {
      file: {
        type: 'positional',
        description: 'The file that holds the review result as JSON',
        required: true,
      },
      json: JSON_ARG,
    },
    run: (command) =>
      run(() =>
        runVerifyCommand({ file: command.values.file, json: command.values.json === true }, ctx),
      ),
  });

  const post = define({
    name: 'post',
    description: 'Post a review result to its pull request as the App, once it verifies',
    args: {
      file: {
        type: 'positional',
        description: 'The file that holds the review result as JSON',
        required: true,
      },
      verify: {
        type: 'boolean',
        negatable: true,
        description: 'Check the result before posting it; --no-verify posts it unchecked',
      },
    },
    run: (command) =>
      run(() =>
        runPostCommand({ file: command.values.file, verify: command.values.verify !== false }, ctx),
      ),
  });

  const main = define({
    name: 'noslop',
    description: 'Review a pull request that a coding agent wrote',
    run: () =>
      run(() =>
        Promise.reject(
          new Error('name a command: review, verify, post, check, config, eval or store'),
        ),
      ),
  });

  // gunshi prints argument errors to stdout and then throws them, so it prints none, and the errors
  // go to stderr here; stdout under --json holds only the JSON output
  try {
    await cli([...argv], main, {
      name: 'noslop',
      version: cliPackage.version,
      renderHeader: null,
      renderValidationErrors: null,
      strict: true,
      subCommands: { review, verify, post, check, config, eval: evaluate, store },
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
