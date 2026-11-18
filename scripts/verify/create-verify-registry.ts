import { join } from 'node:path';
import { createWringer, local } from '@wringer/core';
import type { Wringer } from '@wringer/core';
import { z } from 'zod';
import { checkAppKeys } from './check-app-keys.ts';
import { checkModelCLIs } from './check-model-clis.ts';
import { checkSandboxAccess } from './check-sandbox-access.ts';
import { runDirectoryEnv } from './constants.ts';
import { createAppConnection } from './create-app-connection.ts';
import { createSandboxFix } from './create-sandbox-fix.ts';
import { createSandboxPullRequest } from './create-sandbox-pull-request.ts';
import { featurePaths, ignoredPaths, sharedPaths } from './feature-paths.ts';
import { parseSandboxEnv } from './parse-sandbox-env.ts';
import type { Env } from './parse-sandbox-env.ts';
import { readCheckRun } from './read-check-run.ts';
import { readFindings } from './read-findings.ts';
import { adapterSchema } from './read-run-state.ts';
import { removeSandboxPullRequest } from './remove-sandbox-pull-request.ts';
import { parseRunEndpoints } from './run-endpoints.ts';
import { runSandboxCheck } from './run-sandbox-check.ts';
import { runSandboxReview } from './run-sandbox-review.ts';
import { writeFindingAnswers } from './write-finding-answers.ts';

const noInput = z.strictObject({});
const pullRequestData = z.strictObject({ pullRequest: z.int() });

const reviewData = z.strictObject({
  pullRequest: z.int(),
  findings: z.int(),
  fixChecks: z.int(),
});

const findingsData = z.strictObject({
  pullRequest: z.int(),
  states: z.record(z.string(), z.int()),
});

const reviewTimeoutMs = 600_000;

// The registry's name is not `noslop`: gunshi reads a command group named like the program as the
// program itself.
export function createVerifyRegistry(env: Env): Wringer {
  return createWringer({ name: 'noslop-verify' })
    .target('local', {
      mode: 'launch',
      access: 'read-write',

      // the sandbox repo is private, and a PR description is public
      evidence: 'local',
      host: local(),
      launch: (ctx) => ({
        command: [process.execPath, join(import.meta.dir, 'run-sandbox-host.ts')],
        env: { [runDirectoryEnv]: ctx.runDirectory },
        ready: (line) => (line['event'] === 'ready' ? parseRunEndpoints(line) : null),
      }),
    })
    .secret('NOSLOP_GITHUB_APP_PRIVATE_KEY', 'GH_TOKEN', 'GITHUB_TOKEN')
    .check({
      name: 'app-keys',
      input: noInput,
      data: z.strictObject({ app: z.string() }),
      timeoutMs: 30_000,
      run: () => checkAppKeys(env),
    })
    .check({
      name: 'sandbox-access',
      input: noInput,
      data: z.strictObject({ repo: z.string() }),
      timeoutMs: 30_000,
      run: () => checkSandboxAccess(env),
    })
    .check({
      name: 'model-clis',
      input: noInput,
      data: z.strictObject({ claude: z.literal(true), codex: z.literal(true) }),
      timeoutMs: 30_000,
      run: (_input, ctx) => checkModelCLIs(parseRunEndpoints(ctx.endpoints).clone),
    })
    .action({
      name: 'open-pull-request',
      summary:
        'Push a base branch with the seed and a review.json for the adapter, and a head branch with the seeded defect, then open the pull request',
      effect: 'write',
      input: z.strictObject({ adapter: adapterSchema }),
      data: z.strictObject({ pullRequest: z.int(), url: z.string() }),
      timeoutMs: 120_000,
      run: (input, ctx) =>
        createSandboxPullRequest(
          parseRunEndpoints(ctx.endpoints),
          parseSandboxEnv(env),
          input.adapter,
        ),
    })
    .action({
      name: 'review',
      summary: 'Review the pull request as the App, which posts the findings and the check run',
      effect: 'write',
      input: noInput,
      data: reviewData,
      timeoutMs: reviewTimeoutMs,
      run: (_input, ctx) =>
        runSandboxReview(parseRunEndpoints(ctx.endpoints), parseSandboxEnv(env), 'full'),
    })
    .action({
      name: 'answer-findings',
      summary:
        "Answer the App's finding threads as the author, in comment ID order: the first thread, or every other one",
      effect: 'write',
      input: z.strictObject({
        disposition: z.enum(['fixed', 'not-a-defect']),
        threads: z.enum(['first', 'all-but-first']),
      }),
      data: z.strictObject({ pullRequest: z.int(), answered: z.int() }),
      timeoutMs: 60_000,
      run: async (input, ctx) => {
        const app = await createAppConnection(env);

        return writeFindingAnswers(
          parseRunEndpoints(ctx.endpoints),
          parseSandboxEnv(env),
          app,
          input,
        );
      },
    })
    .action({
      name: 'check',
      summary: 'Run `noslop check`, which sets the check run from the answers, with no review',
      effect: 'write',
      input: noInput,
      data: pullRequestData,
      timeoutMs: 180_000,
      run: (_input, ctx) => runSandboxCheck(parseRunEndpoints(ctx.endpoints), parseSandboxEnv(env)),
    })
    .action({
      name: 'push-fix',
      summary: 'Push a commit that restores the rollback and binds the order status',
      effect: 'write',
      input: noInput,
      data: z.strictObject({ pullRequest: z.int(), fixSha: z.string() }),
      timeoutMs: 120_000,
      run: (_input, ctx) =>
        createSandboxFix(parseRunEndpoints(ctx.endpoints), parseSandboxEnv(env)),
    })
    .action({
      name: 'review-fixes-only',
      summary:
        'Run `noslop review --fixes-only`, which checks each fixed answer and raises nothing',
      effect: 'write',
      input: noInput,
      data: reviewData,
      timeoutMs: reviewTimeoutMs,
      run: (_input, ctx) =>
        runSandboxReview(parseRunEndpoints(ctx.endpoints), parseSandboxEnv(env), 'fixes-only'),
    })
    .action({
      name: 'close-pull-request',
      summary: "Close the run's pull request and delete its 2 branches",
      effect: 'write',
      input: noInput,
      data: pullRequestData,
      timeoutMs: 60_000,
      run: (_input, ctx) =>
        removeSandboxPullRequest(parseRunEndpoints(ctx.endpoints), parseSandboxEnv(env)),
    })
    .command({
      path: ['check-run'],
      summary: "Check the conclusion of the latest noslop check run on the pull request's head",
      effect: 'read',
      args: z.strictObject({ conclusion: z.enum(['success', 'failure']) }),
      data: z.strictObject({ pullRequest: z.int(), headSha: z.string(), conclusion: z.string() }),
      run: async (args, ctx) => {
        const app = await createAppConnection(env);

        return readCheckRun(
          parseRunEndpoints(ctx.endpoints),
          parseSandboxEnv(env),
          app,
          args.conclusion,
        );
      },
    })
    .command({
      path: ['findings'],
      summary:
        'Check the states that `noslop findings` lists: whether some or none are open, and that some are fixed',
      effect: 'read',
      args: z.strictObject({
        open: z.enum(['none', 'some']),
        fixed: z.literal('some').optional(),
      }),
      data: findingsData,
      timeoutMs: 180_000,
      run: (args, ctx) =>
        readFindings(parseRunEndpoints(ctx.endpoints), parseSandboxEnv(env), args),
    })
    .feature(
      {
        name: 'review-and-fix',
        summary:
          'Review a pull request, answer its findings, push a fix, re-review the fixes only, and see the check pass',
        paths: featurePaths['review-and-fix'],
      },
      {
        name: 'review-on-codex',
        summary: 'Review a pull request on the codex adapter, and see findings and a failing check',
        paths: featurePaths['review-on-codex'],
      },
    )
    .shared(...sharedPaths)
    .ignore(...ignoredPaths)
    .build();
}
