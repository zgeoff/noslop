import type {
  ChangedFile,
  Finding,
  FindingLens,
  ModelFinding,
  ReviewConfig,
} from '@noslop/contract';
import { CRITERION_SEVERITY, TITLE_MAX_LENGTH, findingSchema } from '@noslop/contract';
import { isGlobMatch } from '@noslop/static-stage';
import { buildFindingID } from './build-finding-id';
import { normalizeTitle } from './normalize-title';

export interface RawFinding {
  lens: FindingLens;
  callID: string | null;
  finding: ModelFinding;
}

export interface AssembleInput {
  raw: readonly RawFinding[];
  files: readonly ChangedFile[];
  ruleNames: readonly string[];
  riskClasses: readonly string[];
  config: ReviewConfig;
}

export type DropReason =
  | 'anchor-outside-diff'
  | 'outside-diff-without-location'
  | 'unknown-rule'
  | 'plausible-without-fact'
  | 'invalid';

export interface AssembledFindings {
  findings: Finding[];
  dropped: { raw: RawFinding; reason: DropReason }[];
}

const SEVERITY_RANK = { P1: 0, P2: 1, P3: 2 } as const;

// applies the finding rules to the raw output of the calls: a finding off the diff, a taste finding
// without a known rule and a PLAUSIBLE finding without its fact are dropped, and 2 findings of one
// defect at one anchor merge into the one with the higher severity
export function buildFindings(input: AssembleInput): AssembledFindings {
  const files = new Map(input.files.map((file) => [file.path, file]));
  const rules = new Set(input.ruleNames);

  const dropped: AssembledFindings['dropped'] = [];
  const kept: Finding[] = [];

  for (const raw of input.raw) {
    const result = buildFinding(raw, files, rules, input);

    if (typeof result === 'string') {
      dropped.push({ raw, reason: result });
    } else {
      kept.push(result);
    }
  }

  return { findings: mergeDuplicates(kept), dropped };
}

function buildFinding(
  raw: RawFinding,
  files: ReadonlyMap<string, ChangedFile>,
  rules: ReadonlySet<string>,
  input: AssembleInput,
): Finding | DropReason {
  const model = raw.finding;
  const anchor = model.anchor;
  const file = files.get(anchor.path);

  if (file === undefined || !isInHunks(file, anchor.startLine, anchor.endLine)) {
    return 'anchor-outside-diff';
  }

  const touched = isOnChangedLine(file, anchor.startLine, anchor.endLine, true);
  const secondLocation = model.secondLocation ?? undefined;

  if (!touched && secondLocation === undefined && !model.missingChange) {
    return 'outside-diff-without-location';
  }

  if (model.criterion === 'taste-rule' && (model.rule === null || !rules.has(model.rule))) {
    return 'unknown-rule';
  }

  if (model.verdict === 'PLAUSIBLE' && (model.unverifiedFact ?? '').trim() === '') {
    return 'plausible-without-fact';
  }

  const title =
    model.title.length > TITLE_MAX_LENGTH
      ? `${model.title.slice(0, TITLE_MAX_LENGTH - 3).trimEnd()}...`
      : model.title;

  const riskClass = input.riskClasses.find((name) =>
    isGlobMatch(anchor.path, input.config.riskClasses[name]?.paths ?? []),
  );

  // an optional key appears only with a value, so 2 equal findings compare equal
  const parsed = findingSchema.safeParse({
    id: buildFindingID(raw.lens, anchor.path, model.rule ?? model.criterion, title),
    lens: raw.lens,
    callID: raw.callID,
    title,
    body: model.body,
    anchor,
    ...(secondLocation === undefined ? {} : { secondLocation }),
    severity: CRITERION_SEVERITY[model.criterion],
    criterion: model.criterion,
    ...(model.criterion === 'taste-rule' && model.rule !== null ? { rule: model.rule } : {}),
    verdict: model.verdict,
    ...(model.verdict === 'PLAUSIBLE' && model.unverifiedFact !== null
      ? { unverifiedFact: model.unverifiedFact }
      : {}),
    writtenByChange: isOnChangedLine(file, anchor.startLine, anchor.endLine, false),
    ...(riskClass === undefined ? {} : { riskClass }),
    ...(model.fix === null || model.fix === '' ? {} : { fix: model.fix }),
  });

  return parsed.success ? parsed.data : 'invalid';
}

// the head lines of each hunk, its context lines included, are the diff a finding may anchor to
function isInHunks(file: ChangedFile, startLine: number, endLine: number): boolean {
  return file.hunks.some(
    (hunk) =>
      startLine <= hunk.newStart + Math.max(hunk.newLines, 1) - 1 && endLine >= hunk.newStart,
  );
}

// a changed line is one the change added; with deletions counted, the head line where a deleted line
// sat counts as well
function isOnChangedLine(
  file: ChangedFile,
  startLine: number,
  endLine: number,
  withDeletions: boolean,
): boolean {
  for (const hunk of file.hunks) {
    let cursor = hunk.newStart;

    for (const line of hunk.lines) {
      if (line.newLine !== null) {
        cursor = line.newLine;
      }

      const isChanged = line.kind === 'added' || (withDeletions && line.kind === 'deleted');

      if (isChanged && cursor >= startLine && cursor <= endLine) {
        return true;
      }
    }
  }

  return false;
}

// 2 findings are one defect when their anchors overlap and their titles match, or when one lens
// reports one criterion twice on overlapping lines; the merged finding keeps the higher severity
function mergeDuplicates(findings: readonly Finding[]): Finding[] {
  const merged: Finding[] = [];

  for (const finding of findings) {
    const index = merged.findIndex((other) => isSameDefect(other, finding));
    const other = merged[index];

    if (other === undefined) {
      merged.push(finding);
    } else if (SEVERITY_RANK[finding.severity] < SEVERITY_RANK[other.severity]) {
      merged[index] = finding;
    }
  }

  return merged.toSorted(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      left.anchor.path.localeCompare(right.anchor.path) ||
      left.anchor.startLine - right.anchor.startLine,
  );
}

function isSameDefect(left: Finding, right: Finding): boolean {
  const overlaps =
    left.anchor.path === right.anchor.path &&
    left.anchor.startLine <= right.anchor.endLine &&
    right.anchor.startLine <= left.anchor.endLine;

  return (
    overlaps &&
    (normalizeTitle(left.title) === normalizeTitle(right.title) ||
      (left.lens === right.lens && left.criterion === right.criterion))
  );
}
