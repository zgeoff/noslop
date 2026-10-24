import { join, resolve } from 'node:path';
import type { Runner } from '@noslop/runner';
import { runConcurrently } from '@noslop/runner';
import type { Case } from './case';
import type { CaseReview, CaseReviewer, CaseRun } from './types';

export interface RunEvalOptions {
  cases: readonly Case[];
  reviewer: CaseReviewer;
  runner: Runner;
  workDir: string;

  parallel: number;

  onCase?: (run: CaseRun) => void;
}

export function runEval(options: RunEvalOptions): Promise<CaseRun[]> {
  return runConcurrently(options.cases, options.parallel, async (corpusCase) => {
    const worktree = resolve(join(options.workDir, `${corpusCase.id}-${options.reviewer.id}`));

    const review = await runCaseReview(corpusCase, worktree, options);

    const run = { caseID: corpusCase.id, review };

    options.onCase?.(run);

    return run;
  });
}

async function runCaseReview(
  corpusCase: Case,
  worktree: string,
  options: RunEvalOptions,
): Promise<CaseReview> {
  if (options.reviewer.needsWorktree === false) {
    return options.reviewer
      .reviewCase(corpusCase, corpusCase.repo)
      .catch(() => buildFailedReview());
  }

  const added = await options.runner
    .run(['git', 'worktree', 'add', '--detach', '--force', worktree, corpusCase.head], {
      cwd: corpusCase.repo,
    })
    .catch(() => null);

  if (added === null || added.exitCode !== 0) {
    return buildFailedReview();
  }

  const review = await options.reviewer
    .reviewCase(corpusCase, worktree)
    .catch(() => buildFailedReview());

  await options.runner.run(['git', 'worktree', 'remove', '--force', worktree], {
    cwd: corpusCase.repo,
  });

  return review;
}

function buildFailedReview(): CaseReview {
  return {
    findings: [],
    failed: true,
    tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
    durationMs: 0,
    calls: 0,
    depth: null,
  };
}
