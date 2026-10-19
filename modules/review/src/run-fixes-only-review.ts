import { randomUUID } from 'node:crypto';
import type { Logger } from '@logtape/logtape';
import type {
  CallLens,
  CallRecord,
  FailedCall,
  FindingLens,
  FixCheck,
  NotReviewedFile,
  PullRequestRef,
  ReviewAdapter,
  ReviewResult,
} from '@noslop/contract';
import { REVIEW_OUTPUT_VERSION } from '@noslop/contract';
import type { Runner } from '@noslop/runner';
import { z } from 'zod';
import { buildFixCheckPrompt } from './build-fix-check-prompt';

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

  // the sha the answer names
  commit: string;
}

export interface FixesOnlyReviewInput {
  runner: Runner;
  repoDir: string;
  repo: string;
  pullRequest: PullRequestRef;

  // the head of the last review, and the pull request's head now
  base: string;
  head: string;
  title: string;
  configHash: string;
  fixes: readonly AnsweredFix[];

  // the config's file limit: a fix whose code or diff passes it gets no call and stays unconfirmed
  maxFileChars: number;
  adapter: ReviewAdapter;
  tempDir: string;
  logger: Logger;
  now?: () => Date;
}

// a run after the last review round with no lens and no finding: one call per `fixed` answer whose
// commit the new commits hold asks whether the diff of the finding's file fixes it, and the result's
// fix checks list each verdict, so no other fix confirms through the run's silence
export async function runFixesOnlyReview(input: FixesOnlyReviewInput): Promise<ReviewResult> {
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();

  const range = await readGitLines(input, ['rev-list', `${input.base}..${input.head}`]);

  const outcomes = await Promise.all(
    input.fixes.map((fix) => runFixCheck(input, fix, findOneCommit(range, fix.commit))),
  );

  const tooLarge = new Set(outcomes.flatMap((outcome) => outcome.tooLarge ?? []));

  return {
    version: REVIEW_OUTPUT_VERSION,
    reviewID: randomUUID(),
    repo: input.repo,
    pullRequest: input.pullRequest,
    base: input.base,
    head: input.head,
    title: input.title,
    depth: 'light',
    special: null,
    riskClasses: [],
    lenses: [],
    calls: outcomes.flatMap((outcome) => outcome.record ?? []),
    findings: [],
    dropped: [],
    failedCalls: outcomes.flatMap((outcome) => outcome.failedCall ?? []),
    notReviewed: [...tooLarge].map((path): NotReviewedFile => ({ path, reason: 'too-large' })),
    notReviewedByLens: [],
    configHash: input.configHash,
    fixChecks: outcomes.flatMap((outcome) => outcome.check ?? []),
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

// the one commit of the new commits that a `fixed` sha names; a prefix that 2 commits share names
// neither
function findOneCommit(range: readonly string[], sha: string): string | null {
  const matches = range.filter((commit) => commit.startsWith(sha));

  return matches.length === 1 ? (matches[0] ?? null) : null;
}

interface FixCheckOutcome {
  check?: FixCheck;
  record?: CallRecord;
  failedCall?: FailedCall;

  // the finding's file, when its code or diff passes the file limit
  tooLarge?: string;
}

const fixCheckOutputSchema = z.strictObject({ fixed: z.boolean(), reason: z.string().min(1) });

// one fix's call; a fix whose commit the new commits do not hold asks nothing, and a static finding,
// which no model lens reported, takes a full review to confirm
async function runFixCheck(
  input: FixesOnlyReviewInput,
  fix: AnsweredFix,
  match: string | null,
): Promise<FixCheckOutcome> {
  if (match === null) {
    return {};
  }

  if (fix.lens === 'static') {
    const reason = 'a static finding takes a full review to confirm its fix';

    return { check: { findingID: fix.id, fixed: false, reason } };
  }

  const code = await readAnchoredCode(input, fix);
  const diff = await readGitText(input, ['diff', input.base, input.head, '--', fix.path]);

  if (code.length > input.maxFileChars || diff.length > input.maxFileChars) {
    input.logger.warn('the fix of {id} passes the file limit, so it stays unconfirmed', {
      id: fix.id,
    });

    return { tooLarge: fix.path };
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

// the code around the anchored line at the last reviewed head, with its line numbers; a file the
// head does not hold reads as empty, so the call still judges the diff
async function readAnchoredCode(input: FixesOnlyReviewInput, fix: AnsweredFix): Promise<string> {
  const result = await input.runner.run(['git', 'show', `${input.base}:${fix.path}`], {
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
