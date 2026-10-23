import type { FindingLens, Tokens } from '@noslop/contract';
import { mergeTokens } from '@noslop/contract';
import type { Case, Silence } from './case';
import type { ReportedFinding } from './collect-matches';
import { collectMatches } from './collect-matches';
import type { CaseRun } from './types';

export interface LensScore {
  lens: FindingLens | 'unknown';

  // the baseline: true positives the corpus labels with this lens, and how many of them the run
  // repeated with a finding of any lens
  baselineTruePositives: number;
  repeatedTruePositives: number;

  // what this lens reported, split by the label of the corpus finding each one matched
  reported: number;
  matchedTruePositive: number;
  matchedFalsePositive: number;
  matchedDisputed: number;
  unlabelled: number;
  escapesCaught: number;
  silences: number;
  silencesBroken: number;
}

export interface RunScore {
  cases: number;
  failedCases: number;
  lenses: LensScore[];
  baselineTruePositives: number;
  repeatedTruePositives: number;
  reported: number;
  unlabelled: number;
  escapesCaught: number;
  escapesWithAnchor: number;
  silences: number;
  silencesBroken: number;
  lightCases: number;
  lightP1s: number;
  lightEscapes: number;
  tokens: Tokens;
  durationMs: number;
  calls: number;
}

// scores one reviewer's runs against the labelled corpus, per lens, so a lens is measured on its own
// even when a call bundled it with others
export function buildRunScore(
  cases: readonly Case[],
  runs: readonly CaseRun[],
  windowLines: number,
): RunScore {
  const byLens = new Map<LensScore['lens'], LensScore>();

  const getScore = (lens: LensScore['lens']): LensScore => {
    const existing = byLens.get(lens);

    if (existing !== undefined) {
      return existing;
    }

    const created: LensScore = {
      lens,
      baselineTruePositives: 0,
      repeatedTruePositives: 0,
      reported: 0,
      matchedTruePositive: 0,
      matchedFalsePositive: 0,
      matchedDisputed: 0,
      unlabelled: 0,
      escapesCaught: 0,
      silences: 0,
      silencesBroken: 0,
    };

    byLens.set(lens, created);

    return created;
  };

  const total: RunScore = {
    cases: 0,
    failedCases: 0,
    lenses: [],
    baselineTruePositives: 0,
    repeatedTruePositives: 0,
    reported: 0,
    unlabelled: 0,
    escapesCaught: 0,
    escapesWithAnchor: 0,
    silences: 0,
    silencesBroken: 0,
    lightCases: 0,
    lightP1s: 0,
    lightEscapes: 0,
    tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
    durationMs: 0,
    calls: 0,
  };

  for (const run of runs) {
    const corpusCase = cases.find((candidate) => candidate.id === run.caseID);

    if (corpusCase === undefined) {
      continue;
    }

    const review = run.review;

    total.cases += 1;
    total.failedCases += Number(review.failed);
    total.tokens = mergeTokens([total.tokens, review.tokens]);
    total.durationMs += review.durationMs;
    total.calls += review.calls;
    total.reported += review.findings.length;

    const labelMatches = collectMatches(corpusCase.findings, review.findings, windowLines);

    const anchoredEscapes = corpusCase.escapes.flatMap((escape) =>
      escape.anchor === undefined ? [] : [{ lens: escape.lens ?? null, anchor: escape.anchor }],
    );

    const escapeMatches = collectMatches(anchoredEscapes, review.findings, windowLines);

    const matchedReported = new Set(labelMatches.map((match) => match.reported));

    total.escapesWithAnchor += anchoredEscapes.length;
    total.escapesCaught += escapeMatches.length;

    for (const finding of corpusCase.findings) {
      if (finding.label === 'true-positive') {
        getScore(finding.lens ?? 'unknown').baselineTruePositives += 1;
        total.baselineTruePositives += 1;
      }
    }

    for (const match of labelMatches) {
      const labelled = corpusCase.findings[match.target];
      const reported = review.findings[match.reported];

      if (labelled === undefined || reported === undefined) {
        continue;
      }

      const reporterScore = getScore(reported.lens ?? 'unknown');

      if (labelled.label === 'true-positive') {
        getScore(labelled.lens ?? 'unknown').repeatedTruePositives += 1;
        total.repeatedTruePositives += 1;
        reporterScore.matchedTruePositive += 1;
      } else if (labelled.label === 'false-positive') {
        reporterScore.matchedFalsePositive += 1;
      } else {
        reporterScore.matchedDisputed += 1;
      }
    }

    for (const match of escapeMatches) {
      const reported = review.findings[match.reported];

      if (reported !== undefined) {
        getScore(reported.lens ?? 'unknown').escapesCaught += 1;
      }
    }

    for (const [index, reported] of review.findings.entries()) {
      const score = getScore(reported.lens ?? 'unknown');

      score.reported += 1;

      if (!matchedReported.has(index)) {
        score.unlabelled += 1;
        total.unlabelled += 1;
      }
    }

    // a lens whose call failed reports nothing, so its silence would pass without the lens having run
    const scoredSilences = review.failed
      ? []
      : (corpusCase.silences ?? []).filter(
          (silence) => !(review.failedLenses ?? []).includes(silence.lens),
        );

    for (const silence of scoredSilences) {
      const score = getScore(silence.lens);
      const broken = Number(isSilenceBroken(silence, review.findings, windowLines));

      score.silences += 1;
      score.silencesBroken += broken;
      total.silences += 1;
      total.silencesBroken += broken;
    }

    if (review.depth === 'light') {
      total.lightCases += 1;

      total.lightP1s += corpusCase.findings.filter(
        (finding) => finding.label === 'true-positive' && finding.severity === 'P1',
      ).length;

      total.lightEscapes += corpusCase.escapes.length;
    }
  }

  total.lenses = [...byLens.values()].toSorted((left, right) =>
    left.lens.localeCompare(right.lens),
  );

  return total;
}

function isSilenceBroken(
  silence: Silence,
  findings: readonly ReportedFinding[],
  windowLines: number,
): boolean {
  const fromLens = findings.filter((finding) => finding.lens === silence.lens);

  if (silence.anchor === undefined) {
    return fromLens.length > 0;
  }

  return (
    collectMatches([{ lens: silence.lens, anchor: silence.anchor }], fromLens, windowLines).length >
    0
  );
}
