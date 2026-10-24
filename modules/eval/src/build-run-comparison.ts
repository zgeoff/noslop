import { collectMatches } from './collect-matches';
import type { CaseRun } from './types';

export interface RunComparison {
  cases: number;
  findingsFirst: number;
  findingsSecond: number;
  matched: number;

  agreement: number;
}

export function buildRunComparison(
  first: readonly CaseRun[],
  second: readonly CaseRun[],
  windowLines: number,
): RunComparison {
  const comparison = { cases: 0, findingsFirst: 0, findingsSecond: 0, matched: 0, agreement: 0 };

  for (const run of first) {
    const other = second.find((candidate) => candidate.caseID === run.caseID);

    if (other === undefined || run.review.failed || other.review.failed) {
      continue;
    }

    comparison.cases += 1;
    comparison.findingsFirst += run.review.findings.length;
    comparison.findingsSecond += other.review.findings.length;

    comparison.matched += collectMatches(
      run.review.findings,
      other.review.findings,
      windowLines,
    ).length;
  }

  const union = comparison.findingsFirst + comparison.findingsSecond - comparison.matched;

  comparison.agreement = union === 0 ? 1 : comparison.matched / union;

  return comparison;
}
