import { randomUUID } from 'node:crypto';
import type { Logger } from '@logtape/logtape';
import type { PullRequestRef, ReviewAdapter, ReviewResult } from '@noslop/contract';
import { REVIEW_OUTPUT_VERSION } from '@noslop/contract';
import type { Runner } from '@noslop/runner';
import type { AnsweredFix } from './run-fix-checks';
import { runFixChecks } from './run-fix-checks';
import type { ResolutionCheckOptions } from './run-resolution-checks';
import { runResolutionChecks } from './run-resolution-checks';
import type { StaticRecheckOptions } from './run-static-recheck';

export interface FixesOnlyReviewInput {
  runner: Runner;
  repoDir: string;
  repo: string;
  pullRequest: PullRequestRef;

  // where the range of merges the run checks starts: the head of the last review, or the merge base
  // when no review's head is on the branch; and the pull request's head now
  base: string;
  head: string;

  // the merge base of the pull request, where its net diff starts
  mergeBase: string;
  title: string;
  configHash: string;
  fixes: readonly AnsweredFix[];
  maxFileChars: number;
  adapter: ReviewAdapter;
  tempDir: string;
  logger: Logger;
  now?: () => Date;

  // with it, the run also checks the resolution of each merge commit among the new commits whose tree
  // differs from the tree `git merge-tree` builds from its parents; without it, the run checks no merge
  resolution?: ResolutionCheckOptions;

  // what the static stage reads to judge the fix of a static finding over the whole pull request
  staticCheck: StaticRecheckOptions;
}

// a run after the last review round with no lens over the change: each `fixed` answer gets one call
// that judges the finding at the head, or the static stage again for a static finding, and the fix
// checks list each verdict, so no fix confirms through silence; only a merge raises a finding
export async function runFixesOnlyReview(input: FixesOnlyReviewInput): Promise<ReviewResult> {
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();

  const fixChecks = await runFixChecks({
    runner: input.runner,
    repoDir: input.repoDir,
    head: input.head,
    mergeBase: input.mergeBase,
    title: input.title,
    fixes: input.fixes,
    maxFileChars: input.maxFileChars,
    adapter: input.adapter,
    tempDir: input.tempDir,
    logger: input.logger,
    staticCheck: input.staticCheck,
  });

  const merges =
    input.resolution === undefined
      ? null
      : await runResolutionChecks({
          ...input.resolution,
          runner: input.runner,
          repoDir: input.repoDir,
          base: input.base,
          head: input.head,
          adapter: input.adapter,
          tempDir: input.tempDir,
          logger: input.logger,
        });

  return {
    version: REVIEW_OUTPUT_VERSION,
    reviewID: randomUUID(),
    repo: input.repo,
    pullRequest: input.pullRequest,

    // a fix call reads the pull request's whole net diff, so its range starts at the merge base
    base: input.mergeBase,
    head: input.head,
    title: input.title,
    depth: 'light',
    special: null,
    riskClasses: [],
    lenses: [],
    calls: [...fixChecks.records, ...(merges?.records ?? [])],
    findings: merges?.findings ?? [],
    dropped: merges?.dropped ?? [],
    failedCalls: [...fixChecks.failedCalls, ...(merges?.failedCalls ?? [])],
    notReviewed: [...fixChecks.notReviewed, ...(merges?.notReviewed ?? [])],
    notReviewedByLens: [],
    configHash: input.configHash,
    fixesOnly: true,
    fixChecks: fixChecks.checks,
    ...(fixChecks.unjudged.length === 0 ? {} : { unjudgedFixes: fixChecks.unjudged }),
    ...(merges === null || merges.checks.length === 0 ? {} : { resolutionChecks: merges.checks }),
    startedAt,
    endedAt: now().toISOString(),
  };
}
