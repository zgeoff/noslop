import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@logtape/logtape';
import type {
  Change,
  Depth,
  Finding,
  LensID,
  PullRequestRef,
  ReviewAdapter,
  ReviewConfig,
  ReviewResult,
} from '@noslop/contract';
import { REVIEW_OUTPUT_VERSION } from '@noslop/contract';
import type { AssembledFindings, DropReason, RawFinding } from '@noslop/findings';
import { buildFindings } from '@noslop/findings';
import type { PlannedCall, Route } from '@noslop/routing';
import type { Runner } from '@noslop/runner';
import type { StaticStageResult } from '@noslop/static-stage';
import { buildGapTask } from './build-gap-task';
import { buildVerifyTask } from './build-verify-task';
import { planReview } from './plan-review';
import type { CallBatch, CallBatchInput } from './run-planned-calls';
import { runPlannedCalls } from './run-planned-calls';

export interface RunReviewOptions {
  runner: Runner;
  repoDir: string;
  repo: string;
  base: string;
  head: string;
  config: ReviewConfig;
  configHash: string;
  rules: CallBatchInput['rules'];
  adapter: ReviewAdapter;
  logger: Logger;

  // the review's own folder, which the caller creates and deletes
  tempDir: string;
  cacheDir: string | null;
  title: string;
  body: string;
  linkedIssue: string | null;
  pullRequest: PullRequestRef | null;
  isPush: boolean;
  pastEscapes: readonly string[];
  readConsumerFile?: (repo: string, path: string) => Promise<string | null>;
  now?: () => Date;
}

export interface ReviewRun {
  result: ReviewResult;
  dropped: { lens: string; title: string; reason: DropReason }[];
}

// runs the pipeline on one change: the static stage, routing, the calls, and Assemble; the calls
// read a detached worktree of the head, which the review removes whether it passes or fails
export async function runReview(options: RunReviewOptions): Promise<ReviewRun> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();

  const plan = await planReview(options);

  const change = plan.change;
  const stage = plan.stage;

  const ctx: PassContext = {
    options,
    change,
    stage,
    route: plan.route,
    worktree: join(options.tempDir, 'head'),
    staticRaw: stage.findings.map((finding) => ({ lens: 'static', callID: null, finding })),
  };

  const passes = await runCallPasses(ctx);

  const assembled = buildAssembled(ctx, passes.batches);

  return {
    result: {
      version: REVIEW_OUTPUT_VERSION,
      reviewID: randomUUID(),
      repo: options.repo,
      pullRequest: options.pullRequest,
      base: change.base,
      head: change.head,
      title: options.title === '' ? null : options.title,
      depth: passes.depth,
      steppedUpFrom: passes.steppedUpFrom,
      special: ctx.route.special,
      riskClasses: stage.signals.riskClasses,
      lenses: ctx.route.lenses,
      calls: passes.batches.flatMap((batch) => batch.records),
      findings: assembled.findings,
      failedCalls: passes.batches.flatMap((batch) => batch.failed),
      configHash: options.configHash,
      startedAt,
      endedAt: now().toISOString(),
    },
    dropped: assembled.dropped.map((item) => ({
      lens: item.raw.lens,
      title: item.raw.finding.title,
      reason: item.reason,
    })),
  };
}

interface PassContext {
  options: RunReviewOptions;
  change: Change;
  stage: StaticStageResult;
  route: Route;
  worktree: string;
  staticRaw: RawFinding[];
}

interface CallPasses {
  depth: Depth;
  steppedUpFrom: Depth | null;
  batches: CallBatch[];
}

// one call per fired lens group; Deep then adds one verify call over the merged findings and at most
// one gap sweep, and a confirmed P1 at Standard steps the review up to Deep by running only that verify
// call on the findings it has; a route with no calls runs none, and needs no worktree
async function runCallPasses(ctx: PassContext): Promise<CallPasses> {
  if (ctx.route.calls.length === 0) {
    return { depth: ctx.route.depth, steppedUpFrom: null, batches: [] };
  }

  await createWorktree(ctx);

  try {
    const first = await runBatch(ctx, ctx.route.calls, ctx.route.depth, null);

    if (ctx.route.depth === 'deep') {
      const batches = await runDeepPasses(ctx, first, true);

      return { depth: 'deep', steppedUpFrom: null, batches };
    }

    if (ctx.route.depth === 'standard' && hasConfirmedP1(buildAssembled(ctx, [first]))) {
      const batches = await runDeepPasses(ctx, first, false);

      return { depth: 'deep', steppedUpFrom: 'standard', batches };
    }

    return { depth: ctx.route.depth, steppedUpFrom: null, batches: [first] };
  } finally {
    await removeWorktree(ctx);
  }
}

// a worktree that git cannot remove leaves an entry in the repo's worktree list, so the review
// logs it for the user to prune
async function removeWorktree(ctx: PassContext): Promise<void> {
  const result = await ctx.options.runner.run(
    ['git', 'worktree', 'remove', '--force', ctx.worktree],
    { cwd: ctx.options.repoDir },
  );

  if (result.exitCode !== 0) {
    ctx.options.logger.warn('git could not remove the worktree {worktree}: {stderr}', {
      worktree: ctx.worktree,
      stderr: result.stderr.trim(),
    });
  }
}

async function createWorktree(ctx: PassContext): Promise<void> {
  const result = await ctx.options.runner.run(
    ['git', 'worktree', 'add', '--detach', ctx.worktree, ctx.change.head],
    { cwd: ctx.options.repoDir },
  );

  if (result.exitCode !== 0) {
    throw new Error(`git worktree add failed: ${result.stderr.trim()}`);
  }

  await removeSecretFiles(ctx);
}

// the files the `secrets` risk class names leave the worktree before any model reads it, so a
// reviewer never sees a committed secret; the diff still shows the change's own lines
async function removeSecretFiles(ctx: PassContext): Promise<void> {
  const globs = (ctx.options.config.riskClasses['secrets']?.paths ?? []).map(
    (glob) => new Bun.Glob(glob),
  );

  if (globs.length === 0) {
    return;
  }

  const listed = await ctx.options.runner.run(['git', 'ls-files', '-z'], { cwd: ctx.worktree });

  const secrets = listed.stdout
    .split('\0')
    .filter((path) => path !== '' && globs.some((glob) => glob.match(path)));

  // a submodule lists as one path and checks out as a folder, so the removal is recursive
  await Promise.all(
    secrets.map((path) => rm(join(ctx.worktree, path), { recursive: true, force: true })),
  );
}

function runBatch(
  ctx: PassContext,
  calls: readonly PlannedCall[],
  depth: Depth,
  task: CallBatchInput['task'],
): Promise<CallBatch> {
  return runPlannedCalls({
    calls,
    depth,
    adapter: ctx.options.adapter,
    worktree: ctx.worktree,
    tempDir: ctx.options.tempDir,
    logger: ctx.options.logger,
    slices: ctx.stage.slices,
    rules: ctx.options.rules,
    title: ctx.options.title,
    body: ctx.options.body,
    linkedIssue: ctx.options.linkedIssue,
    base: ctx.change.base,
    head: ctx.change.head,
    task,
    parallel: ctx.options.config.thresholds.parallelCalls,
  });
}

function buildAssembled(ctx: PassContext, batches: readonly CallBatch[]): AssembledFindings {
  return buildFindings({
    raw: [...ctx.staticRaw, ...batches.flatMap((batch) => batch.raw)],
    files: ctx.change.files,
    ruleNames: (ctx.options.rules ?? []).map((rule) => rule.name),
    riskClasses: ctx.stage.signals.riskClasses,
    config: ctx.options.config,
  });
}

function hasConfirmedP1(assembled: AssembledFindings): boolean {
  return assembled.findings.some(
    (finding) => finding.severity === 'P1' && finding.verdict === 'CONFIRMED',
  );
}

const VERIFY_CALL = 'verify';
const GAP_CALL = 'gap';

// the verify call re-derives every model finding of the first pass, after the merge, and its findings
// replace them; a failed verify call keeps them; the gap sweep then runs once on a large change when
// no blocking finding survives: a P1, a security finding or a risk-class finding
async function runDeepPasses(
  ctx: PassContext,
  first: CallBatch,
  sweepGaps: boolean,
): Promise<CallBatch[]> {
  const merged = buildAssembled(ctx, [first]).findings.filter(
    (finding) => finding.lens !== 'static',
  );

  const verified = await runVerifyCall(ctx, merged);

  const batches = buildVerifiedBatches(first, verified);

  if (!sweepGaps || !shouldSweepGaps(ctx, batches)) {
    return batches;
  }

  const known = buildAssembled(ctx, batches).findings;

  const gap = await runBatch(ctx, [buildPassCall(ctx, GAP_CALL, ctx.route.lenses)], 'deep', () =>
    buildGapTask(known),
  );

  return [...batches, gap];
}

// the first pass's records stay for their cost; its findings give way to the verified ones, unless
// the verify call failed or never ran
function buildVerifiedBatches(first: CallBatch, verified: CallBatch | null): CallBatch[] {
  if (verified === null) {
    return [first];
  }

  if (verified.failed.length > 0) {
    return [first, verified];
  }

  return [{ ...first, raw: [] }, verified];
}

// one call carries the lenses of every finding it verifies; with no finding there is nothing to verify
function runVerifyCall(ctx: PassContext, findings: readonly Finding[]): Promise<CallBatch | null> {
  const reported = new Set<string>(findings.map((finding) => finding.lens));

  const lenses = ctx.route.lenses.filter((lens) => reported.has(lens));

  if (lenses.length === 0) {
    return Promise.resolve(null);
  }

  return runBatch(ctx, [buildPassCall(ctx, VERIFY_CALL, lenses)], 'deep', () =>
    buildVerifyTask(findings),
  );
}

function shouldSweepGaps(ctx: PassContext, batches: readonly CallBatch[]): boolean {
  const lines = ctx.change.files.reduce(
    (total, file) => total + file.addedLines + file.deletedLines,
    0,
  );

  const isLarge =
    ctx.change.files.length >= ctx.options.config.thresholds.gapSweepMinFiles ||
    lines >= ctx.options.config.thresholds.gapSweepMinLines;

  const hasBlocking = buildAssembled(ctx, batches).findings.some(
    (finding) =>
      finding.severity === 'P1' || finding.lens === 'security' || finding.riskClass !== undefined,
  );

  return isLarge && !hasBlocking;
}

// a pass call runs at Deep's effort on the adapter's model, with the longest timeout of the calls the
// route planned, under an ID that no planned call holds, since a config can name a group `verify`
function buildPassCall(ctx: PassContext, name: string, lenses: readonly LensID[]): PlannedCall {
  const timeouts = ctx.route.calls.flatMap((call) =>
    call.timeoutMs === null ? [] : [call.timeoutMs],
  );

  const taken = new Set(ctx.route.calls.map((call) => call.callID));

  const callID =
    [name, ...Array.from({ length: taken.size }, (_, index) => `${name}-${index + 2}`)].find(
      (id) => !taken.has(id),
    ) ?? name;

  return {
    callID,
    lenses: [...lenses],
    effort: 'high',
    model: null,
    timeoutMs: timeouts.length === 0 ? null : Math.max(...timeouts),
    files: [...ctx.change.files],
  };
}
