import { randomUUID } from 'node:crypto';
import type { Logger } from '@logtape/logtape';
import type { PullRequestRef, ReviewAdapter, ReviewResult } from '@noslop/contract';
import { REVIEW_OUTPUT_VERSION } from '@noslop/contract';
import type { Runner } from '@noslop/runner';
import type { AnsweredFix } from './run-fix-checks';
import { runFixChecks } from './run-fix-checks';
import type { StaticRecheckOptions } from './run-static-recheck';

export interface FixesOnlyReviewInput {
  runner: Runner;
  repoDir: string;
  repo: string;
  pullRequest: PullRequestRef;
  head: string;

  mergeBase: string;
  title: string;
  body: string;
  configHash: string;
  fixes: readonly AnsweredFix[];
  maxFileChars: number;
  maxCallChars: number;
  adapter: ReviewAdapter;
  tempDir: string;
  logger: Logger;
  now?: () => Date;

  staticCheck: StaticRecheckOptions;
}

export async function runFixesOnlyReview(input: FixesOnlyReviewInput): Promise<ReviewResult> {
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();

  const fixChecks = await runFixChecks({
    runner: input.runner,
    repoDir: input.repoDir,
    head: input.head,
    mergeBase: input.mergeBase,
    title: input.title,
    body: input.body,
    fixes: input.fixes,
    maxFileChars: input.maxFileChars,
    maxCallChars: input.maxCallChars,
    adapter: input.adapter,
    tempDir: input.tempDir,
    logger: input.logger,
    staticCheck: input.staticCheck,
  });

  return {
    version: REVIEW_OUTPUT_VERSION,
    reviewID: randomUUID(),
    repo: input.repo,
    pullRequest: input.pullRequest,

    base: input.mergeBase,
    head: input.head,
    title: input.title,
    depth: 'light',
    special: null,
    riskClasses: [],
    lenses: [],
    calls: fixChecks.records,
    findings: [],
    dropped: [],
    failedCalls: fixChecks.failedCalls,
    notReviewed: fixChecks.notReviewed,
    notReviewedByLens: [],
    configHash: input.configHash,
    fixesOnly: true,
    fixChecks: fixChecks.checks,
    ...(fixChecks.unjudged.length === 0 ? {} : { unjudgedFixes: fixChecks.unjudged }),
    startedAt,
    endedAt: now().toISOString(),
  };
}
