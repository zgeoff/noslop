import { join } from 'node:path';
import type { Runner } from '@noslop/runner';
import type { Case } from './case';
import type { CaseReviewer, CaseRun } from './types';

export interface RunEvalOptions {
  cases: readonly Case[];
  reviewer: CaseReviewer;
  runner: Runner;
  workDir: string;
  onCase?: (run: CaseRun) => void;
}

// replays each case through the reviewer at its reviewed head, in a detached worktree of the case's
// repo that the run removes whether the review passes or fails, so the repo's own checkout never moves
export async function runEval(options: RunEvalOptions): Promise<CaseRun[]> {
  const runs: CaseRun[] = [];

  for (const corpusCase of options.cases) {
    const worktree = join(options.workDir, `${corpusCase.id}-${options.reviewer.id}`);

    const added = await options.runner.run(
      ['git', 'worktree', 'add', '--detach', '--force', worktree, corpusCase.head],
      { cwd: corpusCase.repo },
    );

    if (added.exitCode !== 0) {
      runs.push({ caseID: corpusCase.id, review: buildFailedReview() });
      continue;
    }

    const review = await options.reviewer
      .reviewCase(corpusCase, worktree)
      .catch(() => buildFailedReview());

    await options.runner.run(['git', 'worktree', 'remove', '--force', worktree], {
      cwd: corpusCase.repo,
    });

    const run = { caseID: corpusCase.id, review };

    runs.push(run);
    options.onCase?.(run);
  }

  return runs;
}

function buildFailedReview(): CaseRun['review'] {
  return {
    findings: [],
    failed: true,
    tokens: { input: 0, output: 0 },
    durationMs: 0,
    calls: 0,
    depth: null,
  };
}
