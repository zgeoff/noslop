import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { CaseReviewer } from '@noslop/eval';
import type { Runner } from '@noslop/runner';
import { parseCodexReview } from './parse-codex-review';

export interface CodexReviewReviewerOptions {
  runner: Runner;
  tempDir: string;
  timeoutMs: number;
}

// the reference reviewer: `codex review` of the case's change, read-only in the reviewed worktree; its
// runs on the corpus record the baseline and measure the noise floor
export function createCodexReviewReviewer(options: CodexReviewReviewerOptions): CaseReviewer {
  return {
    id: 'codex-review',
    reviewCase: async (corpusCase, worktree) => {
      const outDir = await mkdtemp(join(options.tempDir, 'codex-review-'));

      const outFile = join(outDir, 'last-message.txt');

      const result = await options.runner.run(
        [
          'codex',
          'exec',
          'review',
          '--base',
          corpusCase.base,
          '--ephemeral',
          '-c',
          'sandbox_mode="read-only"',
          '-o',
          outFile,
        ],
        { cwd: worktree, timeoutMs: options.timeoutMs },
      );

      const text = await Bun.file(outFile)
        .text()
        .catch(() => '');

      await rm(outDir, { recursive: true, force: true });

      return {
        findings: parseCodexReview(text, worktree),
        failed: result.exitCode !== 0 || result.timedOut || text === '',
        tokens: { input: 0, output: 0 },
        durationMs: result.durationMs,
        calls: 1,
        depth: null,
      };
    },
  };
}
