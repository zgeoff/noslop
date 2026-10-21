import { randomUUID } from 'node:crypto';
import type { Logger } from '@logtape/logtape';
import type { PullRequestRef, ReviewAdapter, ReviewResult } from '@noslop/contract';
import { REVIEW_OUTPUT_VERSION } from '@noslop/contract';
import type { Runner } from '@noslop/runner';
import { readAncestry } from './read-ancestry';
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

  // the head of the last review, and the pull request's head now
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

  // with it, the run judges the fix of a static finding by running the static stage over the whole
  // pull request again; without it, the run judges such a fix not fixed
  staticCheck?: StaticRecheckOptions;
}

// a run after the last review round with no lens over the change: each `fixed` answer gets one call
// that judges the finding at the head, or the static stage again for a static finding, and the fix
// checks list each verdict, so no fix confirms through silence; only a merge raises a finding
export async function runFixesOnlyReview(input: FixesOnlyReviewInput): Promise<ReviewResult> {
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();

  // a run with no fix to judge reads none of the new commits, so its summary would pass a head that
  // no lens read; only a merge of the base, which brings in code the base holds, needs no fix
  if (input.fixes.length === 0) {
    const range = await readGitLines(input, ['rev-list', `${input.base}..${input.head}`]);

    await requireMergesOfBase(input, range);
  }

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
    ...(input.staticCheck === undefined ? {} : { staticCheck: input.staticCheck }),
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
    base: input.fixes.length === 0 ? input.base : input.mergeBase,
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
    ...(merges === null || merges.checks.length === 0 ? {} : { resolutionChecks: merges.checks }),
    startedAt,
    endedAt: now().toISOString(),
  };
}

async function readGitLines(
  input: FixesOnlyReviewInput,
  args: readonly string[],
): Promise<string[]> {
  const text = await readGitText(input, args);

  return text === '' ? [] : text.split('\n');
}

async function readGitText(input: FixesOnlyReviewInput, args: readonly string[]): Promise<string> {
  const result = await input.runner.run(['git', ...args], { cwd: input.repoDir });

  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}

// throws unless each of the branch's own commits in the range is a merge whose other parents the
// pull request's base holds, and the range holds a commit; a merge with a conflict resolution still
// gets its resolution check
async function requireMergesOfBase(
  input: FixesOnlyReviewInput,
  range: readonly string[],
): Promise<void> {
  const refusal = '--fixes-only has no `fixed` answer to check';

  if (range.length === 0) {
    throw new Error(`${refusal}, and no commit came after the last review`);
  }

  // a commit that a merge brought in from the base is code the base holds, so the range leaves it out
  const own = await readGitLines(input, [
    'rev-list',
    input.head,
    `^${input.base}`,
    `^${input.mergeBase}`,
  ]);

  for (const commit of own) {
    const listed = await readGitText(input, ['rev-list', '--parents', '-n', '1', commit]);

    const others = listed.split(' ').slice(2);

    const held = await Promise.all(
      others.map((parent) => readAncestry(input, parent, input.mergeBase)),
    );

    if (others.length === 0 || held.includes(false)) {
      throw new Error(
        `${refusal}, so it cannot pass ${commit.slice(0, 12)}, which no lens read and which is no merge of the base; run a review without --fixes-only`,
      );
    }
  }
}
