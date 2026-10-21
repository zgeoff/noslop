import { randomUUID } from 'node:crypto';
import type { Logger } from '@logtape/logtape';
import type {
  CallLens,
  CallRecord,
  FailedCall,
  Finding,
  FindingLens,
  FixCheck,
  NotReviewedFile,
  PullRequestRef,
  ReviewAdapter,
  ReviewResult,
} from '@noslop/contract';
import { REVIEW_OUTPUT_VERSION, buildFixFileEvidence } from '@noslop/contract';
import type { Runner } from '@noslop/runner';
import { z } from 'zod';
import { buildFixCheckPrompt } from './build-fix-check-prompt';
import { checkStaticFix } from './check-static-fix';
import { readAncestry } from './read-ancestry';
import type { FixBase } from './read-fix-base';
import { readFixBase } from './read-fix-base';
import type { ResolutionCheckOptions } from './run-resolution-checks';
import { runResolutionChecks } from './run-resolution-checks';
import type { StaticRecheckOptions } from './run-static-recheck';
import { runStaticRecheck } from './run-static-recheck';

// a finding whose latest answer is `fixed <commit>`, as its comment on the pull request keeps it
export interface AnsweredFix {
  id: string;
  title: string;
  lens: FindingLens;
  path: string;

  // the line the comment anchors to, or null for a finding outside the diff
  line: number | null;

  // the finding as posted: its title, body, fix, lens, criterion and rule
  comment: string;

  // the sha the answer names, or the branch commit with its change when a rebase rewrote it
  commit: string;

  // the head of the review that posted the finding, which a marker posted before the field lacks
  postedHead: string | null;

  // the branch commit a rebase made of the posting head, which a late fix must come after; the posted
  // line keeps the posting head's coordinates
  postedBranchHead?: string;
}

export interface FixesOnlyReviewInput {
  runner: Runner;
  repoDir: string;
  repo: string;
  pullRequest: PullRequestRef;

  // the head of the last review, and the pull request's head now
  base: string;
  head: string;

  // the merge base of the pull request, where the diff a fix commit must reach starts
  mergeBase: string;

  // the head of the newest review that ran its lenses, which judged every fix before it
  lensHead: string | null;

  // the reviewed head that a rebase took off the branch, when the base is the branch commit with its
  // patches; a run with no new commit past that base then carries the review onto the head
  rebasedFrom?: string;
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

// a run after the last review round with no lens over the change: each `fixed` answer no review judged
// gets one call over the diff of its files, or the static stage again for a static finding, and the
// fix checks list each verdict, so no fix confirms through silence; only a merge raises a finding
export async function runFixesOnlyReview(input: FixesOnlyReviewInput): Promise<ReviewResult> {
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();

  const range = await readGitLines(input, ['rev-list', `${input.base}..${input.head}`]);
  const bases = await Promise.all(input.fixes.map((fix) => readFixBase(input, fix, range)));

  // a run with no fix to judge reads none of the new commits, so its summary would pass a head that
  // no lens read; only a merge of the base, which brings in code the base holds, needs no fix
  if (bases.every((fixBase) => fixBase === null)) {
    await requireMergesOfBase(input, range);
  }

  const pullRequestFiles = await readGitPaths(input, [
    'diff',
    '-z',
    '--name-only',
    '--no-renames',
    input.mergeBase,
    input.head,
  ]);

  // the stage runs once for every static fix the run judges, and not at all for a run with none
  const hasStaticFix = input.fixes.some(
    (fix, index) => fix.lens === 'static' && (bases[index] ?? null) !== null,
  );

  const staticFindings =
    hasStaticFix && input.staticCheck !== undefined
      ? await runStaticRecheck({
          ...input.staticCheck,
          runner: input.runner,
          repoDir: input.repoDir,
          mergeBase: input.mergeBase,
          head: input.head,
          title: input.title,
        })
      : null;

  const outcomes = await Promise.all(
    input.fixes.map((fix, index) =>
      runFixCheck(input, { fix, base: bases[index] ?? null, pullRequestFiles, staticFindings }),
    ),
  );

  const tooLarge = new Set(outcomes.flatMap((outcome) => outcome.tooLargePath ?? []));

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

  // the range reaches back to the oldest base a fix used, so it holds each commit the run judged
  let base = input.base;

  for (const fixBase of bases) {
    base = fixBase === null ? base : await readGitText(input, ['merge-base', base, fixBase.base]);
  }

  return {
    version: REVIEW_OUTPUT_VERSION,
    reviewID: randomUUID(),
    repo: input.repo,
    pullRequest: input.pullRequest,
    base,
    head: input.head,
    title: input.title,
    depth: 'light',
    special: null,
    riskClasses: [],
    lenses: [],
    calls: [...outcomes.flatMap((outcome) => outcome.record ?? []), ...(merges?.records ?? [])],
    findings: merges?.findings ?? [],
    dropped: merges?.dropped ?? [],
    failedCalls: [
      ...outcomes.flatMap((outcome) => outcome.failedCall ?? []),
      ...(merges?.failedCalls ?? []),
    ],
    notReviewed: [
      ...[...tooLarge].map((path): NotReviewedFile => ({ path, reason: 'too-large' })),
      ...(merges?.notReviewed ?? []),
    ],
    notReviewedByLens: [],
    configHash: input.configHash,
    fixChecks: outcomes.flatMap((outcome) => outcome.check ?? []),
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
// pull request's base holds, and the range holds a commit or the base stands for a rebased head; a merge with a conflict resolution still gets its
// resolution check
async function requireMergesOfBase(
  input: FixesOnlyReviewInput,
  range: readonly string[],
): Promise<void> {
  const refusal = '--fixes-only has no `fixed` answer to check';

  // a rebase that kept each reviewed patch leaves the review true of the head, so with no commit past
  // the base the run has nothing that no lens read
  if (range.length === 0 && input.rebasedFrom !== undefined) {
    return;
  }

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

// the paths a git command run with `-z` lists, each as the file's own name: `-z` ends each with a NUL
// and turns off git's quoting of an unusual name, which would name no file as a pathspec
async function readGitPaths(
  input: FixesOnlyReviewInput,
  args: readonly string[],
): Promise<string[]> {
  const result = await input.runner.run(['git', ...args], { cwd: input.repoDir });

  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout.split('\0').filter((path) => path !== '');
}

interface FixCheckOutcome {
  check?: FixCheck;
  record?: CallRecord;
  failedCall?: FailedCall;
  tooLargePath?: string;
}

const fixCheckOutputSchema = z.strictObject({ fixed: z.boolean(), reason: z.string().min(1) });

interface FixTarget {
  fix: AnsweredFix;
  base: FixBase | null;

  // each path the pull request's diff changes, the earlier path of a renamed file included
  pullRequestFiles: readonly string[];

  // the static findings the whole pull request holds at its head, or null when the run has no static
  // check
  staticFindings: readonly Finding[] | null;
}

async function runFixCheck(
  input: FixesOnlyReviewInput,
  target: FixTarget,
): Promise<FixCheckOutcome> {
  const fix = target.fix;

  if (target.base === null) {
    return {};
  }

  // a merge's files are its change against its first parent, as GitHub lists them
  const commitFiles = await readGitPaths(input, [
    'diff-tree',
    '-z',
    '-r',
    '--root',
    '--no-commit-id',
    '--name-only',
    '--no-renames',
    '--diff-merges=first-parent',
    target.base.commit,
  ]);

  const files = buildFixFileEvidence({
    commitFiles,
    pullRequestFiles: target.pullRequestFiles,
    findingPath: fix.path,
  });

  if (!files.changesPullRequest) {
    const reason = 'the commit changes no file of the pull request';

    return { check: { findingID: fix.id, fixed: false, reason } };
  }

  if (fix.lens === 'static' && target.staticFindings === null) {
    const reason = 'a static finding takes a full review to confirm its fix';

    return { check: { findingID: fix.id, fixed: false, reason } };
  }

  if (fix.lens === 'static') {
    const check = await checkStaticFix({
      runner: input.runner,
      repoDir: input.repoDir,
      head: input.head,
      findingID: fix.id,
      title: fix.title,
      path: fix.path,
      line: fix.line,
      postedHead: fix.postedHead,
      findings: target.staticFindings ?? [],
    });

    return { check };
  }

  const code = await readAnchoredCode(input, fix, target.base.anchor);

  // every file, since a later commit can move the fix's code or its test to a file the fix commit
  // never changed, and only the line it adds there tells a move from a deletion
  const diff = await readGitText(input, [
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--no-renames',
    target.base.commit,
    input.head,
  ]);

  const patch = await readGitText(input, [
    'diff-tree',
    '-p',
    '--root',
    '--no-commit-id',
    '--no-color',
    '--no-ext-diff',
    '--no-renames',
    '--diff-merges=first-parent',
    target.base.commit,
  ]);

  const parts = [code, diff, patch];

  if (parts.some((part) => part.length > input.maxFileChars)) {
    input.logger.warn(
      'the fix of {id} passes the file limit, so no call reads it cut and it stays unjudged',
      {
        id: fix.id,
      },
    );

    return { tooLargePath: fix.path };
  }

  const lens: CallLens = fix.lens;
  const callID = `fix-${fix.id}`;
  const started = performance.now();

  const record: CallRecord = {
    id: callID,
    lenses: [lens],
    depth: 'light',
    adapter: input.adapter.id,
    model: null,
    effort: 'low',
    status: 'ok',
    attempts: 1,
    tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
    durationMs: 0,
  };

  const prompt = buildFixCheckPrompt({
    title: fix.title,
    lens,
    comment: fix.comment,
    path: fix.path,
    code,
    commit: target.base.commit,
    patch,
    diff,
  });

  try {
    const result = await input.adapter.runCall(
      {
        callID,
        lenses: [lens],
        prompt,
        outputSchema: fixCheckOutputSchema,
        effort: 'low',
        model: null,
        cwd: input.tempDir,
        timeoutMs: null,
      },
      { tempDir: input.tempDir, logger: input.logger },
    );

    return {
      check: { findingID: fix.id, fixed: result.output.fixed, reason: result.output.reason },
      record: {
        ...record,
        model: result.model,
        tokens: result.tokens,
        durationMs: Math.round(performance.now() - started),
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    input.logger.warn('the fix check of {id} failed, so its fix stays unconfirmed: {reason}', {
      id: fix.id,
      reason,
    });

    return {
      record: { ...record, status: 'failed', durationMs: Math.round(performance.now() - started) },
      failedCall: { id: callID, lenses: [lens], reason },
    };
  }
}

// the lines above and below the anchored line that the call reads, so it sees the code around the
// finding and no more
const CONTEXT_LINES = 20;

// the most lines of a file the call reads when the finding names no line
const WHOLE_FILE_LINES = 200;

// the code around the anchored line at the anchor commit, with its line numbers; a file the anchor
// does not hold reads as empty, so the call still judges the diff
async function readAnchoredCode(
  input: FixesOnlyReviewInput,
  fix: AnsweredFix,
  anchor: string,
): Promise<string> {
  const result = await input.runner.run(['git', 'show', `${anchor}:${fix.path}`], {
    cwd: input.repoDir,
  });

  if (result.exitCode !== 0) {
    return '';
  }

  // the newline that ends the file starts no line of its own
  const lines = result.stdout.replace(/\n$/u, '').split('\n');
  const first = fix.line === null ? 1 : Math.max(1, fix.line - CONTEXT_LINES);
  const last = fix.line === null ? WHOLE_FILE_LINES : fix.line + CONTEXT_LINES;

  return lines
    .slice(first - 1, last)
    .map((line, index) => `${first + index}: ${line}`)
    .join('\n');
}
