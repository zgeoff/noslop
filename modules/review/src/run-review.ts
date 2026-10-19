import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@logtape/logtape';
import type {
  CallRecord,
  Change,
  ChangedFile,
  Depth,
  DismissedFinding,
  EarlierFinding,
  Finding,
  LensID,
  LensNotReviewedFile,
  NotReviewedFile,
  PullRequestRef,
  ReviewAdapter,
  ReviewConfig,
  ReviewResult,
  Rule,
} from '@noslop/contract';
import { REVIEW_OUTPUT_VERSION } from '@noslop/contract';
import type { AssembledFindings, DismissedFindingsSplit, RawFinding } from '@noslop/findings';
import { buildFindings, splitDismissedFindings } from '@noslop/findings';
import { renderHunks } from '@noslop/lenses';
import type { PlannedCall, Route } from '@noslop/routing';
import type { Runner } from '@noslop/runner';
import type { StaticStageResult } from '@noslop/static-stage';
import { readChange } from '@noslop/static-stage';
import { planReview } from './plan-review';
import type { DesignPass } from './run-design-pass';
import { runDesignPass } from './run-design-pass';
import type { MergePass } from './run-merge-pass';
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

  // the base is the last reviewed head of the pull request, not its merge base; a review without it
  // covers the whole change
  isIncremental?: boolean;

  // the merge base of an incremental review's pull request, so the review keeps to the files the pull
  // request changes and never reviews what a merge from the base branch brought in
  mergeBase?: string;
  isPush: boolean;
  pastEscapes: readonly string[];
  readConsumerFile?: (repo: string, path: string) => Promise<string | null>;
  now?: () => Date;

  // the model of the merge pass; with none, the pass runs on the adapter's own model
  mergeModel?: string | null;

  // a depth that replaces the one the risk score picks, which the eval sets to compare depths
  depth?: Depth | null;

  // which review of the pull request this is, from 1; from the second on, the design pass runs after
  // the merge pass over the findings of this review and of the earlier ones
  round?: number;
  earlierFindings?: readonly EarlierFinding[];

  // the findings of earlier reviews that the author answered `not-a-defect`; the review drops each new
  // finding that matches one, so an answered finding never comes back under a new ID
  dismissedFindings?: readonly DismissedFinding[];
}

export interface ReviewRun {
  result: ReviewResult;
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

  const answered = await readDismissedFindings(ctx, [
    ...merged.findings,
    ...(design?.findings ?? []),
  ]);

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
      calls: [...records, ...passRecords],
      findings: answered.kept,

      // the rule and the quote each dropped taste finding cited, so the store shows whether the
      // quote check drops real findings
      dropped: [
        ...[...assembled.dropped, ...(design?.dropped ?? [])].map((item) => ({
          lens: item.raw.lens,
          callID: item.raw.callID,
          title: item.raw.finding.title,
          anchor: item.raw.finding.anchor,
          criterion: item.raw.finding.criterion,
          reason: item.reason,
          rule: item.raw.finding.rule,
          ruleQuote: item.raw.finding.ruleQuote,
        })),
        ...answered.dismissed.map((finding) => ({
          lens: finding.lens,
          callID: finding.callID,
          title: finding.title,
          anchor: finding.anchor,
          criterion: finding.criterion,
          reason: 'answered-not-a-defect' as const,
          rule: finding.rule ?? null,
          ruleQuote: null,
        })),
      ],
      failedCalls: [
        ...batches.flatMap((batch) => batch.failed),
        ...(design === null || design.failed === null ? [] : [design.failed]),
      ],

      // a reporter reads no fix as confirmed on a file that no call read
      notReviewed: collectNotReviewed(ctx, batches),

      // a reporter reads no silence of a lens as a fix on a file that the lens's call left out
      notReviewedByLens: [
        ...batches.flatMap((batch) => batch.notReviewedByLens),
        ...collectDesignNotReviewed(ctx, design),
      ],
      configHash: options.configHash,
      startedAt,
      endedAt: now().toISOString(),
    },
  };
}

// splits off each finding that matches one answered `not-a-defect`, comparing the code each anchor
// holds at its own head; a review with no such answer reads no code
async function readDismissedFindings(
  ctx: PassContext,
  findings: readonly Finding[],
): Promise<DismissedFindingsSplit> {
  const answered = ctx.options.dismissedFindings ?? [];

  if (answered.length === 0) {
    return { kept: [...findings], dismissed: [] };
  }

  const files = new Map<string, Promise<string[] | null>>();

  const readLines = (commit: string, path: string): Promise<string[] | null> => {
    const key = `${commit}:${path}`;
    const read = files.get(key) ?? readFileLines(ctx, commit, path);

    files.set(key, read);

    return read;
  };

  const quoted = await Promise.all(
    findings.map(async (finding) => {
      const lines = await readLines(ctx.change.head, finding.anchor.path);

      return {
        finding,
        code: toAnchorCode(lines, finding.anchor.startLine, finding.anchor.endLine),
      };
    }),
  );

  const dismissed = await Promise.all(
    answered.map(async (finding) => {
      if (finding.head === null || finding.startLine === null || finding.endLine === null) {
        return { finding, code: null };
      }

      const lines = await readLines(finding.head, finding.path);

      return { finding, code: toAnchorCode(lines, finding.startLine, finding.endLine) };
    }),
  );

  return splitDismissedFindings({
    findings: quoted,
    dismissed,
    maxLines: ctx.options.config.thresholds.dismissedMaxLines,
  });
}

// the lines of a file at a commit; null when git cannot show it, such as a commit a force push dropped
async function readFileLines(
  ctx: PassContext,
  commit: string,
  path: string,
): Promise<string[] | null> {
  const result = await ctx.options.runner.run(['git', 'show', `${commit}:${path}`], {
    cwd: ctx.options.repoDir,
  });

  return result.exitCode === 0 ? result.stdout.split('\n') : null;
}

function toAnchorCode(lines: string[] | null, startLine: number, endLine: number): string | null {
  return lines === null ? null : lines.slice(startLine - 1, endLine).join('\n');
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

interface Passes {
  batches: CallBatch[];
  assembled: AssembledFindings;
  merged: MergePass;
  design: DesignPass | null;
}

// one call per fired lens group, at the effort of the route's depth, then Assemble, the merge pass
// and, from the second review of a pull request on, the design pass; the worktree lives until the
// design pass ends, and a review that runs neither a lens call nor the design pass needs none
async function runPasses(ctx: PassContext): Promise<Passes> {
  const isDesignDue = ctx.options.config.designPass.enabled && (ctx.options.round ?? 1) >= 2;

  if (ctx.route.calls.length === 0 && !isDesignDue) {
    return runFindingPasses(ctx, [], false);
  }

  await createWorktree(ctx);

  try {
    const batches = ctx.route.calls.length === 0 ? [] : [await runBatch(ctx, ctx.route.calls)];

    return await runFindingPasses(ctx, batches, isDesignDue);
  } finally {
    await removeWorktree(ctx);
  }
}

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
    latest: merged.findings,
    earlier: options.earlierFindings ?? [],
    files: await readPullRequestFiles(ctx),
    base: options.mergeBase ?? ctx.change.base,
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

// an approach spans every review of the pull request, so the design pass reads the change since the
// merge base even when this review covers only the commits since the last reviewed head
async function readPullRequestFiles(ctx: PassContext): Promise<readonly ChangedFile[]> {
  const mergeBase = ctx.options.mergeBase;

  if (ctx.options.isIncremental !== true || mergeBase === undefined) {
    return ctx.change.files;
  }

  const whole = await readChange({
    runner: ctx.options.runner,
    repoDir: ctx.options.repoDir,
    base: mergeBase,
    head: ctx.change.head,
    config: ctx.options.config,
  });

  return whole.files;
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
    isIncremental: ctx.options.isIncremental ?? false,
    parallel: ctx.options.config.thresholds.parallelCalls,
    data: ctx.options.config.data,
    maxCallChars: ctx.options.config.thresholds.maxCallChars,
    maxFileChars: ctx.options.config.thresholds.maxFileChars,
  });
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

const MERGE_CALL = 'merge';
const DESIGN_CALL = 'design';

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

// a later review that runs no design call, such as one whose config turns the pass off, read no design
// fix, so it lists the file of each earlier design finding as not reviewed by the design lens, and a
// reporter reads no silence there as a fix; a review that runs the call leaves no file out of it
function collectDesignNotReviewed(
  ctx: PassContext,
  design: DesignPass | null,
): LensNotReviewedFile[] {
  if (design !== null) {
    return [];
  }

  const paths = new Set(
    (ctx.options.earlierFindings ?? [])
      .filter((finding) => finding.lens === 'design')
      .map((finding) => finding.path),
  );

  return [...paths].map((path) => ({ path, lenses: ['design'] }));
}

// the fired lenses that a call ran, in the route's order; a call whose files each overflow a call
// alone runs no part, so its lenses never ran and the store counts none of them
function collectRunLenses(lenses: readonly LensID[], records: readonly CallRecord[]): LensID[] {
  const ran = new Set(records.flatMap((record) => record.lenses));

  return lenses.filter((lens) => ran.has(lens));
}
