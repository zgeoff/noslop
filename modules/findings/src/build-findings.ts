import type {
  ChangedFile,
  DropReason,
  Finding,
  FindingLens,
  ModelFinding,
  ReviewConfig,
  Rule,
  Thresholds,
} from '@noslop/contract';
import { CRITERION_SEVERITY, TITLE_MAX_LENGTH, findingSchema } from '@noslop/contract';
import { buildChangedLines, isGlobMatch } from '@noslop/static-stage';
import { buildFindingID } from './build-finding-id';
import { findRuleCitation } from './find-rule-citation';
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
  rules: readonly Pick<Rule, 'name' | 'body'>[];
  riskClasses: readonly string[];
  config: ReviewConfig;
}

export interface AssembledFindings {
  findings: Finding[];
  dropped: { raw: RawFinding; reason: DropReason }[];
}

export function buildFindings(input: AssembleInput): AssembledFindings {
  const files = new Map(input.files.map((file) => [file.path, file]));

  const dropped: AssembledFindings['dropped'] = [];
  const kept: Finding[] = [];

  for (const raw of input.raw) {
    const result = buildFinding(raw, files, input);

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

  const citesRule = model.criterion === 'taste-rule' || model.ruleQuote !== null;
  const cited = citesRule ? findRuleCitation(input.rules, model.rule, model.ruleQuote) : model.rule;

  if (citesRule && cited === null) {
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

  const parsed = findingSchema.safeParse({
    id: buildFindingID(raw.lens, anchor.path, cited ?? model.criterion, title),
    lens: raw.lens,
    callID: raw.callID,
    title,
    body: model.body,
    anchor,
    ...(secondLocation === undefined ? {} : { secondLocation }),
    severity: CRITERION_SEVERITY[model.criterion],
    criterion: model.criterion,
    ...(citesRule && cited !== null ? { rule: cited } : {}),
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

function isInHunks(file: ChangedFile, startLine: number, endLine: number): boolean {
  return file.hunks.some(
    (hunk) =>
      startLine <= hunk.newStart + Math.max(hunk.newLines, 1) - 1 && endLine >= hunk.newStart,
  );
}

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

const SEVERITY_RANK = { P1: 0, P2: 1, P3: 2 } as const;

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
