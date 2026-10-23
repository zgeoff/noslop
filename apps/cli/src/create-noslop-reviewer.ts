import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { LoadedConfig } from '@noslop/config';
import type { Depth, ReviewAdapter } from '@noslop/contract';
import { mergeTokens } from '@noslop/contract';
import type { CaseReviewer } from '@noslop/eval';
import { getReplayBase } from '@noslop/eval';
import { runReview } from '@noslop/review';
import type { CLIContext } from './cli-context';

export interface NoslopReviewerOptions {
  ctx: CLIContext;
  loaded: LoadedConfig;
  adapter: ReviewAdapter;

  // the depth every case is reviewed at, in place of the one the risk score picks
  depth: Depth | null;

  // the folder that holds each case's own temp folder
  tempDir: string;

  // the config with its `repo:` rules read from the case's repo, as a live review of that repo reads
  // them
  loadCaseConfig: (caseRepo: string) => Promise<LoadedConfig>;
}

// noslop as a reviewer under test: each case runs the whole pipeline on the case's repo at its base and
// head, with the config under test, and a case with a last reviewed head runs as a re-review of the
// push since it; a case fails when the pipeline throws or every call fails
export function createNoslopReviewer(options: NoslopReviewerOptions): CaseReviewer {
  return {
    id: `noslop-${options.adapter.id}`,

    // the pipeline checks out the case's head in a worktree of its own
    needsWorktree: false,
    reviewCase: async (corpusCase) => {
      const tempDir = await mkdtemp(join(options.tempDir, `${corpusCase.id}-`));

      const started = performance.now();

      try {
        const caseConfig = await options.loadCaseConfig(corpusCase.repo);

        const run = await runReview({
          runner: options.ctx.runner,
          repoDir: corpusCase.repo,
          repo: corpusCase.id,
          base: getReplayBase(corpusCase),
          head: corpusCase.head,
          ...(corpusCase.reviewedHead === undefined ? {} : { mergeBase: corpusCase.base }),
          config: options.loaded.config,
          mergeModel: options.loaded.config.adapters[options.adapter.id]?.mergeModel ?? null,
          depth: options.depth,
          configHash: options.loaded.hash,
          rules: caseConfig.rules,
          adapter: options.adapter,
          logger: options.ctx.logger,
          tempDir,
          cacheDir: join(options.ctx.cacheDir, 'index'),
          title: corpusCase.title,
          body: corpusCase.body,
          linkedIssue: corpusCase.linkedIssue ?? null,
          pullRequest: null,
          isIncremental: corpusCase.reviewedHead !== undefined,
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
            criterion: finding.criterion,
            rule: finding.rule,
          })),
          failed: result.calls.length > 0 && result.failedCalls.length === result.calls.length,
          tokens: mergeTokens(result.calls.map((call) => call.tokens)),
          durationMs: Math.round(performance.now() - started),
          calls: result.calls.length,
          depth: result.depth,
          failedLenses: [...new Set(result.failedCalls.flatMap((call) => call.lenses))],
          dropped: result.dropped.map((item) => ({
            lens: item.lens,
            title: item.title,
            reason: item.reason,
            rule: item.rule,
            ruleQuote: item.ruleQuote,
          })),
        };
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  };
}
