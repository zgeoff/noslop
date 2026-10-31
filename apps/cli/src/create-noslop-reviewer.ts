import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { LoadedConfig } from '@noslop/config';
import type { Depth, ReviewAdapter } from '@noslop/contract';
import { mergeTokens } from '@noslop/contract';
import type { Case, CaseFix, CaseReview, CaseReviewer } from '@noslop/eval';
import { getReplayBase } from '@noslop/eval';
import { runFixChecks, runReview } from '@noslop/review';
import type { CLIContext } from './cli-context';

export interface NoslopReviewerOptions {
  ctx: CLIContext;
  loaded: LoadedConfig;
  adapter: ReviewAdapter;

  depth: Depth | null;

  tempDir: string;

  loadCaseConfig: (caseRepo: string) => Promise<LoadedConfig>;
}

export function createNoslopReviewer(options: NoslopReviewerOptions): CaseReviewer {
  return {
    id: `noslop-${options.adapter.id}`,

    needsWorktree: false,
    reviewCase: async (corpusCase) => {
      const tempDir = await mkdtemp(join(options.tempDir, `${corpusCase.id}-`));

      const started = performance.now();

      try {
        if (corpusCase.fixes !== undefined) {
          return await runCaseFixChecks(options, { corpusCase, fixes: corpusCase.fixes, tempDir });
        }

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

interface FixCase {
  corpusCase: Case;
  fixes: readonly CaseFix[];
  tempDir: string;
}

async function runCaseFixChecks(
  options: NoslopReviewerOptions,
  target: FixCase,
): Promise<CaseReview> {
  const started = performance.now();
  const config = options.loaded.config;

  const run = await runFixChecks({
    runner: options.ctx.runner,
    repoDir: target.corpusCase.repo,
    head: target.corpusCase.head,
    mergeBase: target.corpusCase.base,
    title: target.corpusCase.title,
    body: target.corpusCase.body,
    fixes: target.fixes.map((fix) => ({
      id: fix.id,
      title: fix.title,
      lens: fix.lens,
      path: fix.path,
      line: fix.line,
      comment: fix.comment,
      postedHead: fix.postedHead,
      commit: fix.commit,
    })),
    maxFileChars: config.thresholds.maxFileChars,
    maxCallChars: config.thresholds.maxCallChars,
    adapter: options.adapter,
    tempDir: target.tempDir,
    logger: options.ctx.logger,
    staticCheck: {
      config,
      linkedIssue: target.corpusCase.linkedIssue ?? null,
      cacheDir: join(options.ctx.cacheDir, 'index'),
    },
  });

  return {
    findings: [],
    failed: run.records.length > 0 && run.failedCalls.length === run.records.length,
    tokens: mergeTokens(run.records.map((record) => record.tokens)),
    durationMs: Math.round(performance.now() - started),
    calls: run.records.length,
    depth: null,
    fixChecks: [
      ...run.checks,
      ...run.unjudged.map((item) => ({
        findingID: item.findingID,
        fixed: null,
        reason: item.reason,
      })),
    ],
  };
}
