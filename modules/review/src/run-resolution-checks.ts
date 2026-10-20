import { join } from 'node:path';
import type { Logger } from '@logtape/logtape';
import type {
  CallRecord,
  ChangedFile,
  DismissedFinding,
  DroppedFinding,
  FailedCall,
  Finding,
  NotReviewedFile,
  ResolutionCheck,
  ReviewAdapter,
  ReviewConfig,
} from '@noslop/contract';
import { modelFindingSchema } from '@noslop/contract';
import type { RawFinding } from '@noslop/findings';
import { buildFindings } from '@noslop/findings';
import { RESOLUTION_LENSES, buildResolutionPrompt } from '@noslop/lenses';
import type { Runner } from '@noslop/runner';
import { readChange } from '@noslop/static-stage';
import { z } from 'zod';
import { createReviewWorktree } from './create-review-worktree';
import { readDismissedFindings } from './read-dismissed-findings';
import { removeReviewWorktree } from './remove-review-worktree';

// what a resolution check needs beyond a fixes-only run's own input: the config the review reads and
// the findings answered `not-a-defect`, which a resolution finding must not raise again
export interface ResolutionCheckOptions {
  config: ReviewConfig;
  dismissedFindings: readonly DismissedFinding[];
}

export interface ResolutionChecksInput extends ResolutionCheckOptions {
  runner: Runner;
  repoDir: string;

  // the range whose merge commits the run checks
  base: string;
  head: string;
  adapter: ReviewAdapter;
  tempDir: string;
  logger: Logger;
}

export interface ResolutionChecksRun {
  checks: ResolutionCheck[];
  findings: Finding[];
  dropped: DroppedFinding[];
  records: CallRecord[];
  failedCalls: FailedCall[];
  notReviewed: NotReviewedFile[];
}

// one call per merge of the range whose tree differs from the tree `git merge-tree` builds from its
// parents, over the diff from that tree to the merge's, so it judges only what the merge wrote; the
// merges run one at a time, each in a worktree of its own
export async function runResolutionChecks(
  input: ResolutionChecksInput,
): Promise<ResolutionChecksRun> {
  const merges = await readGitLines(input, [
    'rev-list',
    '--merges',
    '--reverse',
    `${input.base}..${input.head}`,
  ]);

  const outcomes: ResolutionOutcome[] = [];

  for (const merge of merges) {
    const outcome = await runResolutionCheck(input, merge);

    outcomes.push(outcome);
  }

  // 2 merges can resolve one file alike, and a finding ID names one comment
  const findings = new Map<string, Finding>();

  for (const finding of outcomes.flatMap((outcome) => outcome.findings ?? [])) {
    findings.set(finding.id, findings.get(finding.id) ?? finding);
  }

  return {
    checks: outcomes.flatMap((outcome) => outcome.check ?? []),
    findings: [...findings.values()],
    dropped: outcomes.flatMap((outcome) => outcome.dropped ?? []),
    records: outcomes.flatMap((outcome) => outcome.record ?? []),
    failedCalls: outcomes.flatMap((outcome) => outcome.failedCall ?? []),
    notReviewed: outcomes.flatMap((outcome) => outcome.notReviewed ?? []),
  };
}

interface ResolutionOutcome {
  check?: ResolutionCheck;
  findings?: Finding[];
  dropped?: DroppedFinding[];
  record?: CallRecord;
  failedCall?: FailedCall;
  notReviewed?: NotReviewedFile[];
}

const resolutionOutputSchema = z.strictObject({
  sound: z.boolean(),
  reason: z.string().min(1),
  findings: z.strictObject({
    correctness: z.array(modelFindingSchema),
    security: z.array(modelFindingSchema),
  }),
});

// the check of one merge: none for a clean merge, a not-sound verdict with no call for a merge of
// more than 2 parents, which `git merge-tree` cannot rebuild, and otherwise one call over the diff
// from the rebuilt tree to the merge's tree
async function runResolutionCheck(
  input: ResolutionChecksInput,
  merge: string,
): Promise<ResolutionOutcome> {
  const listed = await readGitText(input, ['rev-list', '--parents', '-n', '1', merge]);

  const parents = listed.split(' ').slice(1);
  const [first, second] = parents;

  if (parents.length !== 2 || first === undefined || second === undefined) {
    const reason = `noslop rebuilds a merge of 2 parents only, and this merge has ${parents.length}`;

    return { check: { merge, sound: false, reason, findingIDs: [] } };
  }

  const rebuilt = await readMergeTree(input, first, second);
  const tree = await readGitText(input, ['rev-parse', `${merge}^{tree}`]);

  if (rebuilt.tree === tree) {
    return {};
  }

  const base = await createRebuiltMergeCommit(input, rebuilt.tree, [first, second]);

  const change = await readChange({
    runner: input.runner,
    repoDir: input.repoDir,
    base,
    head: merge,
    config: input.config,
  });

  const prompt = buildResolutionPrompt({
    merge,
    parents: [first, second],
    conflicted: rebuilt.conflicted,
    files: change.files,
  });

  if (prompt.length > input.config.thresholds.maxCallChars) {
    input.logger.warn('the resolution of {merge} passes the call limit, so it stays unchecked', {
      merge: merge.slice(0, 12),
    });

    // the skipped call counts as failed, so the run is partial: the check fails, and the next
    // fixes-only run starts from the head before this one and checks the merge again
    const reason = 'the resolution passes the call limit, so no call read it';

    return {
      failedCall: {
        id: `resolution-${merge.slice(0, 12)}`,
        lenses: [...RESOLUTION_LENSES],
        reason,
      },
      notReviewed: change.files.map((file): NotReviewedFile => ({
        path: file.path,
        reason: 'too-large',
      })),
    };
  }

  return runResolutionCall(input, { merge, prompt, files: change.files });
}

interface RebuiltMerge {
  tree: string;

  // the files git could not merge on its own
  conflicted: string[];
}

// the tree git builds from the 2 parents, conflict markers in each file it could not merge, and those
// files; `-z` ends each name with a NUL and turns off git's quoting of an unusual name
async function readMergeTree(
  input: ResolutionChecksInput,
  first: string,
  second: string,
): Promise<RebuiltMerge> {
  const args = ['merge-tree', '--write-tree', '-z', '--name-only', '--no-messages', first, second];

  const result = await input.runner.run(['git', ...args], { cwd: input.repoDir });

  // git exits 1 when the merge has a conflict, and still writes the tree
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  const [tree = '', ...conflicted] = result.stdout.split('\0').filter((part) => part !== '');

  return { tree: tree.trim(), conflicted };
}

// the change reads between 2 commits, so the rebuilt tree gets a commit of its own; git writes it to
// the repo's objects, no ref names it, and git's garbage collection removes it
async function createRebuiltMergeCommit(
  input: ResolutionChecksInput,
  tree: string,
  parents: readonly [string, string],
): Promise<string> {
  const args = [
    '-c',
    'user.name=noslop',
    '-c',
    'user.email=noslop@localhost',
    'commit-tree',
    tree,
    '-p',
    parents[0],
    '-p',
    parents[1],
    '-m',
    'the tree git merge-tree builds',
  ];

  const result = await input.runner.run(['git', ...args], { cwd: input.repoDir });

  if (result.exitCode !== 0) {
    throw new Error(`git commit-tree failed: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}

interface ResolutionCall {
  merge: string;
  prompt: string;
  files: readonly ChangedFile[];
}

// the call reads a worktree of the merge, and its findings keep to the lines of the resolution diff;
// a finding that matches one answered `not-a-defect` drops, as in a review
async function runResolutionCall(
  input: ResolutionChecksInput,
  call: ResolutionCall,
): Promise<ResolutionOutcome> {
  const callID = `resolution-${call.merge.slice(0, 12)}`;
  const lenses = [...RESOLUTION_LENSES];
  const started = performance.now();

  const record: CallRecord = {
    id: callID,
    lenses,
    depth: 'standard',
    adapter: input.adapter.id,
    model: null,
    effort: 'medium',
    status: 'ok',
    attempts: 1,
    tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
    durationMs: 0,
  };

  const worktree = {
    runner: input.runner,
    repoDir: input.repoDir,
    worktree: join(input.tempDir, callID),
    head: call.merge,
    config: input.config,
    logger: input.logger,
  };

  await createReviewWorktree(worktree);

  try {
    const result = await input.adapter.runCall(
      {
        callID,
        lenses,
        prompt: call.prompt,
        outputSchema: resolutionOutputSchema,
        effort: 'medium',
        model: null,
        cwd: worktree.worktree,
        timeoutMs: null,
      },
      { tempDir: input.tempDir, logger: input.logger },
    );

    const output = result.output;

    const raw = RESOLUTION_LENSES.flatMap((lens) =>
      output.findings[lens].map((finding): RawFinding => ({ lens, callID, finding })),
    );

    const assembled = buildFindings({
      raw,
      files: call.files,
      rules: [],
      riskClasses: [],
      config: input.config,
    });

    // the merge chose each line of its resolution, a side's line it kept as context among them, so a
    // finding on it is the merge's own and never a follow-up after the re-check
    const answered = await readDismissedFindings({
      runner: input.runner,
      repoDir: input.repoDir,
      head: call.merge,
      findings: assembled.findings.map((finding) => ({ ...finding, writtenByChange: true })),
      dismissed: input.dismissedFindings,
      maxLines: input.config.thresholds.dismissedMaxLines,
    });

    const placed = await resolveHeadFindings(input, call.merge, answered.kept);

    // a resolution that raises a finding is no sound one, whatever the call's own verdict says, and a
    // not-sound verdict that rests only on findings the author answered `not-a-defect` holds
    const isAnswered =
      assembled.findings.length > 0 && answered.dismissed.length === assembled.findings.length;

    return {
      check: {
        merge: call.merge,
        sound: answered.kept.length === 0 && (output.sound || isAnswered),
        reason: output.reason,
        findingIDs: placed.map((finding) => finding.id),
      },
      findings: placed,
      dropped: [
        ...assembled.dropped.map((item): DroppedFinding => ({
          lens: item.raw.lens,
          callID,
          title: item.raw.finding.title,
          anchor: item.raw.finding.anchor,
          criterion: item.raw.finding.criterion,
          reason: item.reason,
          rule: item.raw.finding.rule,
          ruleQuote: item.raw.finding.ruleQuote,
        })),
        ...answered.dismissed.map((item): DroppedFinding => ({
          lens: item.finding.lens,
          callID,
          title: item.finding.title,
          anchor: item.finding.anchor,
          criterion: item.finding.criterion,
          reason: 'answered-not-a-defect',
          rule: item.finding.rule ?? null,
          ruleQuote: null,
          answeredID: item.answeredID,
        })),
      ],
      record: {
        ...record,
        model: result.model,
        tokens: result.tokens,
        durationMs: Math.round(performance.now() - started),
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    input.logger.warn('the resolution check of {merge} failed, so it stays unchecked: {reason}', {
      merge: call.merge.slice(0, 12),
      reason,
    });

    return {
      record: { ...record, status: 'failed', durationMs: Math.round(performance.now() - started) },
      failedCall: { id: callID, lenses, reason },
    };
  } finally {
    await removeReviewWorktree(worktree);
  }
}

// the reporter posts each finding at the pull request's head, so each anchor moves from the merge's
// lines to the same lines at the head; a finding whose lines a later commit rewrote keeps its anchor
// at the merge, which it names, and posts outside the diff
async function resolveHeadFindings(
  input: ResolutionChecksInput,
  merge: string,
  findings: readonly Finding[],
): Promise<Finding[]> {
  const placed: Finding[] = [];

  for (const finding of findings) {
    const hunks =
      merge === input.head ? [] : await readLaterHunks(input, merge, finding.anchor.path);

    const anchor = findHeadAnchor(hunks, finding.anchor);
    const moved = anchor === null ? { ...finding, anchorCommit: merge } : { ...finding, anchor };

    placed.push(moved);
  }

  return placed;
}

interface LaterHunk {
  oldStart: number;
  oldLines: number;
  newLines: number;
}

// the hunks with no context lines of the file's change from the merge to the head; a path is a file's
// own name, never a glob, and a rename reads as a deletion, so a finding in a renamed file drops
async function readLaterHunks(
  input: ResolutionChecksInput,
  merge: string,
  path: string,
): Promise<LaterHunk[]> {
  const diff = await readGitText(input, [
    '--literal-pathspecs',
    'diff',
    '--no-ext-diff',
    '--no-renames',
    '--unified=0',
    merge,
    input.head,
    '--',
    path,
  ]);

  return [...diff.matchAll(/^@@ -(?<os>\d+)(?:,(?<ol>\d+))? \+\d+(?:,(?<nl>\d+))? @@/gmu)].map(
    (match) => ({
      oldStart: Number(match.groups?.['os']),
      oldLines: Number(match.groups?.['ol'] ?? '1'),
      newLines: Number(match.groups?.['nl'] ?? '1'),
    }),
  );
}

// the anchor's lines at the head, shifted by each hunk above them; null when a hunk changes a line of
// the anchor or adds a line inside it; a hunk that adds lines only, with no old line, adds them after
// its start line
function findHeadAnchor(
  hunks: readonly LaterHunk[],
  anchor: Finding['anchor'],
): Finding['anchor'] | null {
  let shift = 0;

  for (const hunk of hunks) {
    const oldEnd = hunk.oldLines === 0 ? hunk.oldStart : hunk.oldStart + hunk.oldLines - 1;
    const isAbove = oldEnd < anchor.startLine;

    const isBelow =
      hunk.oldLines === 0 ? hunk.oldStart >= anchor.endLine : hunk.oldStart > anchor.endLine;

    if (isAbove) {
      shift += hunk.newLines - hunk.oldLines;
    } else if (!isBelow) {
      return null;
    }
  }

  return { ...anchor, startLine: anchor.startLine + shift, endLine: anchor.endLine + shift };
}

async function readGitLines(
  input: ResolutionChecksInput,
  args: readonly string[],
): Promise<string[]> {
  const text = await readGitText(input, args);

  return text === '' ? [] : text.split('\n');
}

async function readGitText(input: ResolutionChecksInput, args: readonly string[]): Promise<string> {
  const result = await input.runner.run(['git', ...args], { cwd: input.repoDir });

  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}
