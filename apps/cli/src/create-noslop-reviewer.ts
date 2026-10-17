import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { LoadedConfig } from '@noslop/config';
import type { ReviewAdapter } from '@noslop/contract';
import type { CaseReviewer } from '@noslop/eval';
import { runReview } from '@noslop/review';
import type { CLIContext } from './cli-context';

export interface NoslopReviewerOptions {
  ctx: CLIContext;
  loaded: LoadedConfig;
  adapter: ReviewAdapter;

  // the folder that holds each case's own temp folder
  tempDir: string;
}

// noslop as a reviewer under test: each case runs the whole pipeline on the case's repo at its base and
// head, with the config under test; a case fails when the pipeline throws or every call fails
export function createNoslopReviewer(options: NoslopReviewerOptions): CaseReviewer {
  return {
    id: `noslop-${options.adapter.id}`,

    // the pipeline checks out the case's head in a worktree of its own
    needsWorktree: false,
    reviewCase: async (corpusCase) => {
      const tempDir = await mkdtemp(join(options.tempDir, `${corpusCase.id}-`));

      const started = performance.now();

      try {
        const run = await runReview({
          runner: options.ctx.runner,
          repoDir: corpusCase.repo,
          repo: corpusCase.id,
          base: corpusCase.base,
          head: corpusCase.head,
          config: options.loaded.config,
          mergeModel: options.loaded.config.adapters[options.adapter.id]?.mergeModel ?? null,
          configHash: options.loaded.hash,
          rules: options.loaded.rules,
          adapter: options.adapter,
          logger: options.ctx.logger,
          tempDir,
          cacheDir: join(options.ctx.cacheDir, 'index'),
          title: corpusCase.title,
          body: corpusCase.body,
          linkedIssue: null,
          pullRequest: null,
          isPush: false,
          pastEscapes: [],
        });

        const result = run.result;

        return {
          findings: result.findings.map((finding) => ({
            lens: finding.lens,
            anchor: finding.anchor,
            title: finding.title,
            severity: finding.severity,
          })),
          failed: result.calls.length > 0 && result.failedCalls.length === result.calls.length,
          tokens: {
            input: result.calls.reduce((total, call) => total + call.tokens.input, 0),
            output: result.calls.reduce((total, call) => total + call.tokens.output, 0),
          },
          durationMs: Math.round(performance.now() - started),
          calls: result.calls.length,
          depth: result.depth,
        };
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  };
}
