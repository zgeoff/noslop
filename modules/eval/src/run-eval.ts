import { join, resolve } from 'node:path';
import type { Runner } from '@noslop/runner';
import type { Case } from './case';
import type { CaseReview, CaseReviewer, CaseRun } from './types';

export interface RunEvalOptions {
  cases: readonly Case[];
  reviewer: CaseReviewer;
  runner: Runner;
  workDir: string;
  onCase?: (run: CaseRun) => void;
}

// replays each case through the reviewer at its reviewed head, in a detached worktree of the case's
// repo that the run removes whether the review passes or fails, so the repo's own checkout never moves;
// a case that cannot be checked out or reviewed is recorded as failed, and the run goes on
export async function runEval(options: RunEvalOptions): Promise<CaseRun[]> {
  const runs: CaseRun[] = [];

  for (const corpusCase of options.cases) {
    const worktree = resolve(join(options.workDir, `${corpusCase.id}-${options.reviewer.id}`));

    const review = await runCaseReview(corpusCase, worktree, options);

    const run = { caseID: corpusCase.id, review };

    runs.push(run);
    options.onCase?.(run);
  }

  return runs;
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
    tokens: { input: 0, output: 0 },
    durationMs: 0,
    calls: 0,
    depth: null,
  };
}
