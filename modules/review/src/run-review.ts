import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Logger } from '@logtape/logtape';
import type {
  Change,
  Depth,
  ModelFinding,
  PullRequestRef,
  ReviewAdapter,
  ReviewConfig,
  ReviewResult,
} from '@noslop/contract';
import { REVIEW_OUTPUT_VERSION } from '@noslop/contract';
import type { AssembledFindings, DropReason, RawFinding } from '@noslop/findings';
import { buildFindings } from '@noslop/findings';
import type { PlannedCall, Route, RouteInput } from '@noslop/routing';
import { buildRoute, planCalls } from '@noslop/routing';
import type { Runner } from '@noslop/runner';
import type { StaticStageResult } from '@noslop/static-stage';
import { readChange, runStaticStage } from '@noslop/static-stage';
import { buildGapTask } from './build-gap-task';
import { buildVerifyTask } from './build-verify-task';
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

  const change = await readChange({
    runner: options.runner,
    repoDir: options.repoDir,
    base: options.base,
    head: options.head,
    config: options.config,
  });

  const stage = await runStaticStage({
    runner: options.runner,
    repoDir: options.repoDir,
    change,
    config: options.config,
    title: options.title,
    body: options.body,
    linkedIssue: options.linkedIssue,
    cacheDir: options.cacheDir,
    pastEscapes: options.pastEscapes,
    ...(options.readConsumerFile === undefined
      ? {}
      : { readConsumerFile: options.readConsumerFile }),
  });

  const routeInput: RouteInput = {
    change,
    slices: stage.slices,
    signals: stage.signals,
    config: options.config,
    linkedIssue: options.linkedIssue,
    isSync: stage.isSync,
    isRelease: stage.isRelease,
    isPush: options.isPush,
    packageDirs: stage.packageDirs,
  };

  const ctx: PassContext = {
    options,
    change,
    stage,
    routeInput,
    route: buildRoute(routeInput),
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
  routeInput: RouteInput;
  route: Route;
  worktree: string;
  staticRaw: RawFinding[];
}

interface CallPasses {
  depth: Depth;
  steppedUpFrom: Depth | null;
  batches: CallBatch[];
}

// a confirmed P1 at Standard reruns the calls at Deep once, and Deep adds a verify pass and a gap
// sweep; a route with no calls runs none, and needs no worktree
async function runCallPasses(ctx: PassContext): Promise<CallPasses> {
  if (ctx.route.calls.length === 0) {
    return { depth: ctx.route.depth, steppedUpFrom: null, batches: [] };
  }

  await createWorktree(ctx);

  try {
    const first = await runBatch(ctx, ctx.route.calls, ctx.route.depth, null);

    if (ctx.route.depth === 'deep') {
      const batches = await runDeepPasses(ctx, [], ctx.route.calls, first);

      return { depth: 'deep', steppedUpFrom: null, batches };
    }

    if (ctx.route.depth === 'standard' && hasConfirmedP1(buildAssembled(ctx, [first]))) {
      const plan = planCalls(ctx.routeInput, ctx.route.lenses, 'deep');

      const deep = await runBatch(ctx, plan, 'deep', null);
      const batches = await runDeepPasses(ctx, [first], plan, deep);

      return { depth: 'deep', steppedUpFrom: 'standard', batches };
    }

    return { depth: ctx.route.depth, steppedUpFrom: null, batches: [first] };
  } finally {
    await ctx.options.runner.run(['git', 'worktree', 'remove', '--force', ctx.worktree], {
      cwd: ctx.options.repoDir,
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

const VERIFY_PREFIX = 'verify:';

// the verify pass re-derives the findings of each Deep call, and its findings replace that call's;
// a call whose verify call failed keeps its own; the gap sweep then runs on a large change when no
// P1 survives, because a surviving P1 already blocks the merge
async function runDeepPasses(
  ctx: PassContext,
  earlier: readonly CallBatch[],
  plan: readonly PlannedCall[],
  deep: CallBatch,
): Promise<CallBatch[]> {
  const byCall = Map.groupBy(deep.raw, (raw) => raw.callID ?? '');
  const toVerify = plan.filter((call) => byCall.has(call.callID));
  const verifyPlan = toVerify.map((call) => buildRenamedCall(call, VERIFY_PREFIX));

  const verified = await runBatch(ctx, verifyPlan, 'deep', (call) => {
    const raw = byCall.get(call.callID.slice(VERIFY_PREFIX.length));

    return buildVerifyTask(collectModelFindings(raw));
  });

  const kept = new Set(verified.failed.map((item) => item.id.slice(VERIFY_PREFIX.length)));
  const replaced = new Set(toVerify.map((call) => call.callID).filter((id) => !kept.has(id)));

  const batches = [
    ...earlier,
    { ...deep, raw: deep.raw.filter((raw) => !replaced.has(raw.callID ?? '')) },
    verified,
  ];

  const lines = ctx.change.files.reduce(
    (total, file) => total + file.addedLines + file.deletedLines,
    0,
  );

  const isLarge =
    ctx.change.files.length >= ctx.options.config.thresholds.gapSweepMinFiles ||
    lines >= ctx.options.config.thresholds.gapSweepMinLines;

  const hasP1 = buildAssembled(ctx, batches).findings.some((finding) => finding.severity === 'P1');

  if (!isLarge || hasP1) {
    return batches;
  }

  const known = batches.flatMap((batch) => collectModelFindings(batch.raw));
  const gapPlan = plan.map((call) => buildRenamedCall(call, 'gap:'));

  const gap = await runBatch(ctx, gapPlan, 'deep', () => buildGapTask(known));

  return [...batches, gap];
}

// a pass reruns a call under its own ID, so the review result lists the pass beside the call
function buildRenamedCall(call: PlannedCall, prefix: string): PlannedCall {
  return { ...call, callID: `${prefix}${call.callID}` };
}

function collectModelFindings(raw: readonly RawFinding[] | undefined): ModelFinding[] {
  return (raw ?? []).map((item) => item.finding);
}
