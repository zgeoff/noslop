import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@logtape/logtape';
import type {
  Change,
  Depth,
  PullRequestRef,
  ReviewAdapter,
  ReviewConfig,
  ReviewResult,
  Rule,
} from '@noslop/contract';
import { REVIEW_OUTPUT_VERSION } from '@noslop/contract';
import type { AssembledFindings, DropReason, RawFinding } from '@noslop/findings';
import { buildFindings } from '@noslop/findings';
import type { PlannedCall, Route } from '@noslop/routing';
import type { Runner } from '@noslop/runner';
import type { StaticStageResult } from '@noslop/static-stage';
import { planReview } from './plan-review';
import { runMergePass } from './run-merge-pass';
import type { CallBatch } from './run-planned-calls';
import { runPlannedCalls } from './run-planned-calls';

export interface RunReviewOptions {
  runner: Runner;
  repoDir: string;
  repo: string;
  base: string;
  head: string;
  config: ReviewConfig;
  configHash: string;
  rules: readonly Rule[] | null;
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

  // the model of the merge pass; with none, the pass runs on the adapter's own model
  mergeModel?: string | null;

  // a depth that replaces the one the risk score picks, which the eval sets to compare depths
  depth?: Depth | null;
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
    rules: collectChangeRules(options.rules, change),
  };

  const batches = await runCalls(ctx);

  const assembled = buildAssembled(ctx, batches);

  const merged = await runMergePass({
    findings: assembled.findings,
    config: options.config,
    adapter: options.adapter,
    model: options.mergeModel ?? null,
    callID: pickPassID(ctx, MERGE_CALL),
    depth: ctx.route.depth,
    lenses: ctx.route.lenses,
    tempDir: options.tempDir,
    logger: options.logger,
  });

  const records = batches.flatMap((batch) => batch.records);

  return {
    result: {
      version: REVIEW_OUTPUT_VERSION,
      reviewID: randomUUID(),
      repo: options.repo,
      pullRequest: options.pullRequest,
      base: change.base,
      head: change.head,
      title: options.title === '' ? null : options.title,
      depth: ctx.route.depth,
      special: ctx.route.special,
      riskClasses: stage.signals.riskClasses,
      lenses: ctx.route.lenses,
      calls: merged.record === null ? records : [...records, merged.record],
      findings: merged.findings,
      failedCalls: batches.flatMap((batch) => batch.failed),
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

  // the rules that apply to the change: every rule but a reference's, which needs a changed path
  // that one of its globs matches
  rules: readonly Rule[] | null;
}

function collectChangeRules(rules: readonly Rule[] | null, change: Change): Rule[] | null {
  if (rules === null) {
    return null;
  }

  return rules.filter(
    (rule) =>
      rule.paths === null ||
      rule.paths.some((glob) => {
        const matcher = new Bun.Glob(glob);

        return change.files.some((file) => matcher.match(file.path));
      }),
  );
}

// one call per fired lens group, at the effort of the route's depth; a route with no calls runs none,
// and needs no worktree
async function runCalls(ctx: PassContext): Promise<CallBatch[]> {
  if (ctx.route.calls.length === 0) {
    return [];
  }

  await createWorktree(ctx);

  try {
    return [await runBatch(ctx, ctx.route.calls)];
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

function runBatch(ctx: PassContext, calls: readonly PlannedCall[]): Promise<CallBatch> {
  return runPlannedCalls({
    calls,
    depth: ctx.route.depth,
    adapter: ctx.options.adapter,
    worktree: ctx.worktree,
    tempDir: ctx.options.tempDir,
    logger: ctx.options.logger,
    slices: ctx.stage.slices,
    rules: ctx.rules,
    title: ctx.options.title,
    body: ctx.options.body,
    linkedIssue: ctx.options.linkedIssue,
    base: ctx.change.base,
    head: ctx.change.head,
    parallel: ctx.options.config.thresholds.parallelCalls,
  });
}

function buildAssembled(ctx: PassContext, batches: readonly CallBatch[]): AssembledFindings {
  return buildFindings({
    raw: [...ctx.staticRaw, ...batches.flatMap((batch) => batch.raw)],
    files: ctx.change.files,
    ruleNames: (ctx.rules ?? []).map((rule) => rule.name),
    riskClasses: ctx.stage.signals.riskClasses,
    config: ctx.options.config,
  });
}

const MERGE_CALL = 'merge';

// the first of name, name-2 and so on that no planned call holds, since a config can name a group
// `merge`
function pickPassID(ctx: PassContext, name: string): string {
  const taken = new Set(ctx.route.calls.map((call) => call.callID));

  return (
    [name, ...Array.from({ length: taken.size }, (_, index) => `${name}-${index + 2}`)].find(
      (id) => !taken.has(id),
    ) ?? name
  );
}
