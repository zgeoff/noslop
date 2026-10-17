import type {
  ChangedFile,
  Finding,
  FindingLens,
  ModelFinding,
  ReviewConfig,
  Thresholds,
} from '@noslop/contract';
import { CRITERION_SEVERITY, TITLE_MAX_LENGTH, findingSchema } from '@noslop/contract';
import { buildChangedLines, isGlobMatch } from '@noslop/static-stage';
import { buildFindingID } from './build-finding-id';
import { normalizeTitle } from './normalize-title';
import { splitTitleWords } from './split-title-words';

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

  return { findings: buildUniqueIDs(mergeDuplicates(kept, input.config.thresholds)), dropped };
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

// the static stage's own reading of the changed lines, so a finding and a direct finding anchor to
// the same head line for each deletion
function isOnChangedLine(
  file: ChangedFile,
  startLine: number,
  endLine: number,
  withDeletions: boolean,
): boolean {
  const lines = buildChangedLines(file);
  const changed = withDeletions ? lines.touched : lines.added;

  for (let line = startLine; line <= endLine; line += 1) {
    if (changed.has(line)) {
      return true;
    }
  }

  return false;
}

// 2 findings are one defect when their anchors overlap and their titles say the same thing; the
// merged finding keeps the higher severity
function mergeDuplicates(findings: readonly Finding[], thresholds: Thresholds): Finding[] {
  const merged: Finding[] = [];

  for (const finding of findings) {
    const index = merged.findIndex((other) => isSameDefect(other, finding, thresholds));
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

// one defect reported at 2 separate places of a file hashes to one ID, so each place after the first,
// in anchor order, hashes its place number into its ID and every ID stays unique in the review
function buildUniqueIDs(findings: readonly Finding[]): Finding[] {
  const seen = new Map<string, number>();

  return findings.map((finding) => {
    const place = (seen.get(finding.id) ?? 0) + 1;

    seen.set(finding.id, place);

    return place === 1 ? finding : buildPlacedFinding(finding, place);
  });
}

function buildPlacedFinding(finding: Finding, place: number): Finding {
  const id = new Bun.CryptoHasher('sha256')
    .update(`${finding.id}\n${place}`)
    .digest('hex')
    .slice(0, 16);

  return { ...finding, id };
}

// a reordered or shorter wording of one defect merges, but a title that swaps a word, such as request
// for response, can name another defect; a test finding asks for a test where a fix finding asks for
// a fix, so the 2 kinds never merge
function isSameDefect(left: Finding, right: Finding, thresholds: Thresholds): boolean {
  const overlaps =
    left.anchor.path === right.anchor.path &&
    left.anchor.startLine <= right.anchor.endLine &&
    right.anchor.startLine <= left.anchor.endLine;

  if (!overlaps || (left.lens === 'tests') !== (right.lens === 'tests')) {
    return false;
  }

  if (normalizeTitle(left.title) === normalizeTitle(right.title)) {
    return true;
  }

  const leftWords = splitTitleWords(left.title);
  const rightWords = splitTitleWords(right.title);
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;

  return (
    shared >= thresholds.mergeMinSharedWords && shared === Math.min(leftWords.size, rightWords.size)
  );
}
