import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Logger } from '@logtape/logtape';
import type {
  CallRecord,
  Change,
  Depth,
  DismissedFinding,
  Finding,
  LensID,
  NotReviewedFile,
  PullRequestRef,
  ReviewAdapter,
  ReviewConfig,
  ReviewResult,
  Rule,
} from '@noslop/contract';
import { REVIEW_OUTPUT_VERSION } from '@noslop/contract';
import type { AssembledFindings, RawFinding } from '@noslop/findings';
import { buildFindings } from '@noslop/findings';
import { renderHunks } from '@noslop/lenses';
import type { PlannedCall, Route } from '@noslop/routing';
import type { Runner } from '@noslop/runner';
import type { StaticStageResult } from '@noslop/static-stage';
import { buildDroppedFindings } from './build-dropped-findings';
import { createReviewWorktree } from './create-review-worktree';
import { planReview } from './plan-review';
import { readDismissedFindings } from './read-dismissed-findings';
import { removeReviewWorktree } from './remove-review-worktree';
import type { DesignPass } from './run-design-pass';
import { runDesignPass } from './run-design-pass';
import type { AnsweredFix, FixChecksRun } from './run-fix-checks';
import { runFixChecks } from './run-fix-checks';
import type { MergePass } from './run-merge-pass';
import { runMergePass } from './run-merge-pass';
import type { CallBatch } from './run-planned-calls';
import { runPlannedCalls } from './run-planned-calls';

export interface FixCallOptions {
  answers: readonly AnsweredFix[];
  pullRequestBase: string;
}

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

  // the review covers only part of the pull request, what changed since an earlier review of it; a
  // review without it covers the whole change
  isIncremental?: boolean;

  // the merge base of an incremental review's pull request, so the review keeps to the files the pull
  // request changes and never reviews what a merge from the base branch brought in
  mergeBase?: string;
  paths?: readonly string[];
  isPush: boolean;
  pastEscapes: readonly string[];
  readConsumerFile?: (repo: string, path: string) => Promise<string | null>;
  author?: string;
  now?: () => Date;

  // the model of the merge pass; with none, the pass runs on the adapter's own model
  mergeModel?: string | null;

  // a depth that replaces the one the risk score picks, which the eval sets to compare depths
  depth?: Depth | null;

  // the first review of a pull request runs the design pass after the merge pass; a later review and a
  // review of a local change run none
  isFirstPullRequestReview?: boolean;

  // the findings of earlier reviews that the author answered `not-a-defect`; the review drops each new
  // finding that matches one, so an answered finding never comes back under a new ID
  dismissedFindings?: readonly DismissedFinding[];

  // the open `fixed` answers of a pull request, and its merge base, where the diff a fix call reads
  // starts; the review makes a fix call for each answer whose finding it no longer reports
  fixes?: FixCallOptions;
}

export interface ReviewRun {
  result: ReviewResult;
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

  const passes = await runPasses(ctx);

  const batches = passes.batches;
  const assembled = passes.assembled;
  const merged = passes.merged;
  const design = passes.design;
  const records = batches.flatMap((batch) => batch.records);
  const passRecords = [merged.record, design?.record ?? null].filter((record) => record !== null);

  const answered = await readDismissedFindings({
    runner: options.runner,
    repoDir: options.repoDir,
    head: change.head,
    findings: [...merged.findings, ...(design?.findings ?? [])],
    dismissed: options.dismissedFindings ?? [],
    maxLines: options.config.thresholds.dismissedMaxLines,
  });

  const fixChecks = await runDroppedFixChecks(options, answered.kept);

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
      lenses: collectRunLenses(ctx.route.lenses, records),
      calls: [...records, ...passRecords, ...(fixChecks?.records ?? [])],
      findings: answered.kept,

      dropped: buildDroppedFindings(
        [...assembled.dropped, ...(design?.dropped ?? [])],
        answered.dismissed,
      ),
      failedCalls: [
        ...batches.flatMap((batch) => batch.failed),
        ...(design === null || design.failed === null ? [] : [design.failed]),
        ...(fixChecks?.failedCalls ?? []),
      ],
      notReviewed: [...collectNotReviewed(ctx, batches), ...(fixChecks?.notReviewed ?? [])],
      notReviewedByLens: batches.flatMap((batch) => batch.notReviewedByLens),
      configHash: options.configHash,
      ...(fixChecks === null ? {} : { fixChecks: fixChecks.checks }),
      ...(fixChecks === null || fixChecks.unjudged.length === 0
        ? {}
        : { unjudgedFixes: fixChecks.unjudged }),
      startedAt,
      endedAt: now().toISOString(),
    },
  };
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

interface Passes {
  batches: CallBatch[];
  assembled: AssembledFindings;
  merged: MergePass;
  design: DesignPass | null;
}

// one call per fired lens group, at the effort of the route's depth, then Assemble, the merge pass
// and, on the first review of a pull request, the design pass; the worktree lives until the design
// pass ends, and a review that runs neither a lens call nor the design pass needs none
async function runPasses(ctx: PassContext): Promise<Passes> {
  const isDesignDue =
    ctx.options.config.designPass.enabled && ctx.options.isFirstPullRequestReview === true;

  if (ctx.route.calls.length === 0 && !isDesignDue) {
    return runFindingPasses(ctx, [], false);
  }

  const worktree = {
    runner: ctx.options.runner,
    repoDir: ctx.options.repoDir,
    worktree: ctx.worktree,
    head: ctx.change.head,
    config: ctx.options.config,
    logger: ctx.options.logger,
  };

  await createReviewWorktree(worktree);

  try {
    const batches = ctx.route.calls.length === 0 ? [] : [await runBatch(ctx, ctx.route.calls)];

    return await runFindingPasses(ctx, batches, isDesignDue);
  } finally {
    await removeReviewWorktree(worktree);
  }
}

const MERGE_CALL = 'merge';
const DESIGN_CALL = 'design';

async function runFindingPasses(
  ctx: PassContext,
  batches: CallBatch[],
  isDesignDue: boolean,
): Promise<Passes> {
  const options = ctx.options;
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

  if (!isDesignDue) {
    return { batches, assembled, merged, design: null };
  }

  const design = await runDesignPass({
    title: options.title,
    body: options.body,
    findings: merged.findings,
    files: ctx.change.files,
    base: ctx.change.base,
    head: ctx.change.head,
    riskClasses: ctx.stage.signals.riskClasses,
    config: options.config,
    adapter: options.adapter,
    callID: pickPassID(ctx, DESIGN_CALL),
    depth: ctx.route.depth,
    worktree: ctx.worktree,
    tempDir: options.tempDir,
    logger: options.logger,
  });

  return { batches, assembled, merged, design };
}

function buildAssembled(ctx: PassContext, batches: readonly CallBatch[]): AssembledFindings {
  return buildFindings({
    raw: [...ctx.staticRaw, ...batches.flatMap((batch) => batch.raw)],
    files: ctx.change.files,
    rules: ctx.rules ?? [],
    riskClasses: ctx.stage.signals.riskClasses,
    config: ctx.options.config,
  });
}

// the first of name, name-2 and so on that no planned call holds, since a config can name a group
// `merge` or `design`
function pickPassID(ctx: PassContext, name: string): string {
  const taken = new Set(ctx.route.calls.map((call) => call.callID));

  return (
    [name, ...Array.from({ length: taken.size }, (_, index) => `${name}-${index + 2}`)].find(
      (id) => !taken.has(id),
    ) ?? name
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
    isIncremental: ctx.options.isIncremental ?? false,
    parallel: ctx.options.config.thresholds.parallelCalls,
    data: ctx.options.config.data,
    maxCallChars: ctx.options.config.thresholds.maxCallChars,
    maxFileChars: ctx.options.config.thresholds.maxFileChars,
  });
}

// a fix call for each `fixed` answer whose finding the review no longer reports; a finding it reports
// again stays open with no call, since the report is the verdict
function runDroppedFixChecks(
  options: RunReviewOptions,
  findings: readonly Finding[],
): Promise<FixChecksRun | null> {
  if (options.fixes === undefined) {
    return Promise.resolve(null);
  }

  const reported = new Set(findings.map((finding) => finding.id));

  return runFixChecks({
    runner: options.runner,
    repoDir: options.repoDir,
    head: options.head,
    mergeBase: options.fixes.pullRequestBase,
    title: options.title,
    body: options.body,
    fixes: options.fixes.answers.filter((fix) => !reported.has(fix.id)),
    maxFileChars: options.config.thresholds.maxFileChars,
    adapter: options.adapter,
    tempDir: options.tempDir,
    logger: options.logger,
    staticCheck: {
      config: options.config,
      linkedIssue: options.linkedIssue,
      cacheDir: options.cacheDir,
      ...(options.author === undefined ? {} : { author: options.author }),
    },
  });
}

// the fired lenses that a call ran, in the route's order; a call whose files each overflow a call
// alone runs no part, so its lenses never ran and the store counts none of them
function collectRunLenses(lenses: readonly LensID[], records: readonly CallRecord[]): LensID[] {
  const ran = new Set(records.flatMap((record) => record.lenses));

  return lenses.filter((lens) => ran.has(lens));
}

// the files the call batch left out, as too large or as data, and each data file of the change, which
// no call reads either, so a route that runs no call still lists them
function collectNotReviewed(ctx: PassContext, batches: readonly CallBatch[]): NotReviewedFile[] {
  const listed = batches.flatMap((batch) => batch.notReviewed);

  const paths = new Set(listed.map((file) => file.path));

  const globs = ctx.options.config.data.map((glob) => new Bun.Glob(glob));

  const data = ctx.change.files
    .filter((file) => !paths.has(file.path) && globs.some((glob) => glob.match(file.path)))
    .map((file): NotReviewedFile => ({ path: file.path, reason: 'data' }));

  // a data file, or one whose hunks pass the file limit, that only a merge from the base branch
  // changes stays listed, so a fix commit that reaches it confirms nothing, as when the change held it
  const maxFileChars = ctx.options.config.thresholds.maxFileChars;

  const baseOnly = (ctx.change.baseOnly ?? []).flatMap((file): NotReviewedFile[] => {
    if (globs.some((glob) => glob.match(file.path))) {
      return [{ path: file.path, reason: 'data' }];
    }

    return renderHunks([file]).length > maxFileChars
      ? [{ path: file.path, reason: 'too-large' }]
      : [];
  });

  return [...listed, ...data, ...baseOnly];
}
