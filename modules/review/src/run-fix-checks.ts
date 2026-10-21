import type { Logger } from '@logtape/logtape';
import type {
  CallLens,
  CallRecord,
  FailedCall,
  Finding,
  FindingLens,
  FixCheck,
  NotReviewedFile,
  ReviewAdapter,
  UnjudgedFix,
} from '@noslop/contract';
import type { Runner } from '@noslop/runner';
import { z } from 'zod';
import { buildFixCheckPrompt } from './build-fix-check-prompt';
import { checkStaticFix } from './check-static-fix';
import { findHeadAnchor } from './find-head-anchor';
import { readLaterHunks } from './read-later-hunks';
import type { StaticRecheckOptions } from './run-static-recheck';
import { runStaticRecheck } from './run-static-recheck';

// a finding whose latest answer is `fixed`, as its comment on the pull request keeps it
export interface AnsweredFix {
  id: string;
  title: string;
  lens: FindingLens;
  path: string;

  // the line the comment anchors to, or null for a finding outside the diff
  line: number | null;

  // the finding as posted: its title, body, fix, lens, criterion and rule
  comment: string;

  // the head of the review that posted the finding, which a marker posted before the field lacks
  postedHead: string | null;
}

export interface FixChecksInput {
  runner: Runner;
  repoDir: string;
  head: string;

  // the merge base of the pull request, where its net diff starts
  mergeBase: string;
  title: string;
  fixes: readonly AnsweredFix[];
  maxFileChars: number;
  adapter: ReviewAdapter;
  tempDir: string;
  logger: Logger;

  // what the static stage reads to judge the fix of a static finding over the whole pull request
  staticCheck: StaticRecheckOptions;
}

export interface FixChecksRun {
  checks: FixCheck[];
  records: CallRecord[];
  failedCalls: FailedCall[];

  // each fix with no verdict, from a failed call or a file past the limit
  unjudged: UnjudgedFix[];

  // each finding's file whose code or diff passes the file limit, so no call judged its fix
  notReviewed: NotReviewedFile[];
}

// one call per `fixed` answer that judges the finding at the head, or the static stage again for a
// static finding; a fix with no verdict, from a failed call or a file past the limit, stays unjudged
export async function runFixChecks(input: FixChecksInput): Promise<FixChecksRun> {
  // the stage runs once for every static fix the run judges, and not at all for a run with none
  const hasStaticFix = input.fixes.some((fix) => fix.lens === 'static');

  const staticFindings = hasStaticFix
    ? await runStaticRecheck({
        ...input.staticCheck,
        runner: input.runner,
        repoDir: input.repoDir,
        mergeBase: input.mergeBase,
        head: input.head,
        title: input.title,
      })
    : [];

  // every file, since the fix of a finding can sit in another file, such as a test it asks for
  const diff = input.fixes.some((fix) => fix.lens !== 'static')
    ? await readGitText(input, [
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-renames',
        input.mergeBase,
        input.head,
      ])
    : '';

  const outcomes = await Promise.all(
    input.fixes.map((fix) => runFixCheck(input, { fix, diff, staticFindings })),
  );

  const tooLarge = new Set(outcomes.flatMap((outcome) => outcome.tooLargePath ?? []));

  return {
    checks: outcomes.flatMap((outcome) => outcome.check ?? []),
    records: outcomes.flatMap((outcome) => outcome.record ?? []),
    failedCalls: outcomes.flatMap((outcome) => outcome.failedCall ?? []),
    unjudged: outcomes.flatMap((outcome) => outcome.unjudged ?? []),
    notReviewed: [...tooLarge].map((path): NotReviewedFile => ({ path, reason: 'too-large' })),
  };
}

async function readGitText(input: FixChecksInput, args: readonly string[]): Promise<string> {
  const result = await input.runner.run(['git', ...args], { cwd: input.repoDir });

  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}

interface FixCheckOutcome {
  check?: FixCheck;
  record?: CallRecord;
  failedCall?: FailedCall;
  unjudged?: UnjudgedFix;
  tooLargePath?: string;
}

const fixCheckOutputSchema = z.strictObject({ fixed: z.boolean(), reason: z.string().min(1) });

interface FixTarget {
  fix: AnsweredFix;

  // the pull request's net diff at the head
  diff: string;

  // the static findings the whole pull request holds at its head
  staticFindings: readonly Finding[];
}

async function runFixCheck(input: FixChecksInput, target: FixTarget): Promise<FixCheckOutcome> {
  const fix = target.fix;

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
      findings: target.staticFindings,
    });

    return { check };
  }

  const code = await readHeadCode(input, fix);

  // a pull request's net diff passes one file's limit long before its own files do, so the call then
  // reads the diff of the finding's file alone
  const isWholeDiff = target.diff.length <= input.maxFileChars;

  const diff = isWholeDiff
    ? target.diff
    : await readGitText(input, [
        '--literal-pathspecs',
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-renames',
        input.mergeBase,
        input.head,
        '--',
        fix.path,
      ]);

  if (code.text.length > input.maxFileChars || diff.length > input.maxFileChars) {
    input.logger.warn(
      'the fix of {id} passes the file limit, so no call reads it cut and it stays unjudged',
      {
        id: fix.id,
      },
    );

    const reason = 'its code or diff passes the file limit, so no call read it whole';

    return { tooLargePath: fix.path, unjudged: { findingID: fix.id, reason } };
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
    code: code.text,
    isTraced: code.isTraced,
    diff,
    isWholeDiff,
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
      unjudged: { findingID: fix.id, reason: 'its fix call failed' },
    };
  }
}

// the lines above and below the traced line that the call reads, so it sees the code around the
// finding and no more
const CONTEXT_LINES = 20;

interface HeadCode {
  // the numbered lines the call reads; empty for a file the head does not hold
  text: string;
  isTraced: boolean;
}

async function readHeadCode(input: FixChecksInput, fix: AnsweredFix): Promise<HeadCode> {
  const result = await input.runner.run(['git', 'show', `${input.head}:${fix.path}`], {
    cwd: input.repoDir,
  });

  if (result.exitCode !== 0) {
    return { text: '', isTraced: false };
  }

  const line = await readTracedLine(input, fix);

  // the newline that ends the file starts no line of its own
  const lines = result.stdout.replace(/\n$/u, '').split('\n');
  const first = line === null ? 1 : Math.max(1, line - CONTEXT_LINES);
  const last = line === null ? lines.length : line + CONTEXT_LINES;

  const text = lines
    .slice(first - 1, last)
    .map((code, index) => `${first + index}: ${code}`)
    .join('\n');

  return { text, isTraced: line !== null };
}

async function readTracedLine(input: FixChecksInput, fix: AnsweredFix): Promise<number | null> {
  if (fix.line === null || fix.postedHead === null) {
    return null;
  }

  const hunks =
    fix.postedHead === input.head
      ? []
      : await readLaterHunks({
          runner: input.runner,
          repoDir: input.repoDir,
          from: fix.postedHead,
          to: input.head,
          path: fix.path,
        });

  const traced =
    hunks === null ? null : findHeadAnchor(hunks, { startLine: fix.line, endLine: fix.line });

  return traced?.startLine ?? null;
}
