import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Case } from '@noslop/eval';
import { buildStaticScore, renderStaticReport, runStaticEval } from '@noslop/eval';
import { planReview } from '@noslop/review';
import type { CLIContext } from './cli-context';
import { loadRepoConfig } from './load-repo-config';
import { resolveRepoDir } from './resolve-repo-dir';
import type { EvalValues } from './run-eval-command';

// plans each case with the working directory's config and no model call, and writes the depth, the
// labels and the planned calls of every case to the out folder; a label's anchor plays no part, so
// the cases need no check of their paths
export async function runStaticEvalCommand(
  cases: readonly Case[],
  values: EvalValues,
  ctx: CLIContext,
): Promise<number> {
  const repoDir = await resolveRepoDir(ctx);
  const loaded = await loadRepoConfig(ctx, repoDir);

  const runs = await runStaticEval({
    cases,
    parallel: loaded.config.thresholds.parallelCases,
    planner: {
      planCase: async (corpusCase) => {
        const plan = await planReview({
          runner: ctx.runner,
          repoDir: corpusCase.repo,
          base: corpusCase.base,
          head: corpusCase.head,
          config: loaded.config,
          cacheDir: join(ctx.cacheDir, 'index'),
          title: corpusCase.title,
          body: corpusCase.body,
          linkedIssue: null,
          isPush: false,
          pastEscapes: [],
        });

        return {
          depth: plan.route.depth,
          special: plan.route.special,
          calls: plan.route.calls.map((call) => call.callID),
          maxCalls: plan.maxCalls,
        };
      },
    },
  });

  const score = buildStaticScore(cases, runs);
  const report = renderStaticReport(score);
  const outDir = resolve(ctx.cwd, values.out ?? join(ctx.cacheDir, 'eval', `static-${Date.now()}`));

  await mkdir(outDir, { recursive: true });

  await Bun.write(join(outDir, 'static.json'), JSON.stringify({ outDir, runs, score }, null, 2));
  await Bun.write(join(outDir, 'static.md'), report);

  const output = values.json ? `${JSON.stringify({ outDir, score }, null, 2)}\n` : report;

  ctx.writeStdout(output);

  return 0;
}
