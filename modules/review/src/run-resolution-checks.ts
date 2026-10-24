import { join } from 'node:path';
import type { Logger } from '@logtape/logtape';
import type {
  CallRecord,
  ChangedFile,
  DismissedFinding,
  DroppedFinding,
  FailedCall,
  Finding,
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
import { buildDroppedFindings } from './build-dropped-findings';
import { createReviewWorktree } from './create-review-worktree';
import { findHeadAnchor } from './find-head-anchor';
import { readDismissedFindings } from './read-dismissed-findings';
import type { LaterHunk } from './read-later-hunks';
import { readLaterHunks } from './read-later-hunks';
import { removeReviewWorktree } from './remove-review-worktree';

export interface ResolutionCheckOptions {
  config: ReviewConfig;
  dismissedFindings: readonly DismissedFinding[];
}

export interface ResolutionChecksInput extends ResolutionCheckOptions {
  runner: Runner;
  repoDir: string;

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
}

interface ResolutionOutcome {
  check?: ResolutionCheck;
  findings?: Finding[];
  dropped?: DroppedFinding[];
  record?: CallRecord;
  failedCall?: FailedCall;
}

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
  };
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

async function runResolutionCheck(
  input: ResolutionChecksInput,
  merge: string,
): Promise<ResolutionOutcome> {
  const listed = await readGitText(input, ['rev-list', '--parents', '-n', '1', merge]);

  const parents = listed.split(' ').slice(1);
  const [first, second] = parents;

  // `git merge-tree` merges exactly 2 commits, so it cannot rebuild a merge of more parents
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

    const reason = 'the resolution passes the call limit, so no call read it';

    return {
      failedCall: {
        id: `resolution-${merge.slice(0, 12)}`,
        lenses: [...RESOLUTION_LENSES],
        reason,
      },
    };
  }

  return runResolutionCall(input, { merge, prompt, files: change.files });
}

interface RebuiltMerge {
  tree: string;

  conflicted: string[];
}

async function readMergeTree(
  input: ResolutionChecksInput,
  first: string,
  second: string,
): Promise<RebuiltMerge> {
  // `-z` ends each name with a NUL and turns off git's quoting of an unusual name
  const args = ['merge-tree', '--write-tree', '-z', '--name-only', '--no-messages', first, second];

  const result = await input.runner.run(['git', ...args], { cwd: input.repoDir });

  // git exits 1 when the merge has a conflict, and still writes the tree
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  const [tree = '', ...conflicted] = result.stdout.split('\0').filter((part) => part !== '');

  return { tree: tree.trim(), conflicted };
}

// git keeps the commit in the repo's objects with no ref naming it, and its garbage collection
// removes it, so the check deletes nothing
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

const resolutionOutputSchema = z.strictObject({
  sound: z.boolean(),
  reason: z.string().min(1),
  findings: z.strictObject({
    correctness: z.array(modelFindingSchema),
    security: z.array(modelFindingSchema),
  }),
});

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

    const answered = await readDismissedFindings({
      runner: input.runner,
      repoDir: input.repoDir,
      head: call.merge,
      findings: assembled.findings.map((finding) => ({ ...finding, writtenByChange: true })),
      dismissed: input.dismissedFindings,
      maxLines: input.config.thresholds.dismissedMaxLines,
    });

    const placed = await loadHeadFindings(input, call.merge, answered.kept);

    const isAnswered =
      assembled.findings.length > 0 &&
      assembled.dropped.length === 0 &&
      answered.dismissed.length === assembled.findings.length;

    return {
      check: {
        merge: call.merge,
        sound: answered.kept.length === 0 && (output.sound || isAnswered),
        reason: output.reason,
        findingIDs: placed.map((finding) => finding.id),
      },
      findings: placed,
      dropped: buildDroppedFindings(assembled.dropped, answered.dismissed),
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

async function loadHeadFindings(
  input: ResolutionChecksInput,
  merge: string,
  findings: readonly Finding[],
): Promise<Finding[]> {
  const placed: Finding[] = [];

  for (const finding of findings) {
    const hunks =
      merge === input.head ? [] : await readMergeHunks(input, merge, finding.anchor.path);

    const anchor = findHeadAnchor(hunks, finding.anchor);
    const moved = anchor === null ? { ...finding, anchorCommit: merge } : { ...finding, anchor };

    placed.push(moved);
  }

  return placed;
}

async function readMergeHunks(
  input: ResolutionChecksInput,
  merge: string,
  path: string,
): Promise<LaterHunk[]> {
  const hunks = await readLaterHunks({
    runner: input.runner,
    repoDir: input.repoDir,
    from: merge,
    to: input.head,
    path,
  });

  if (hunks === null) {
    throw new Error(`git diff ${merge} ${input.head} -- ${path} failed`);
  }

  return hunks;
}
