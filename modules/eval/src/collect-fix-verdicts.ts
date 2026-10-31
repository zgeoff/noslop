import type { Case, CaseFix } from './case';
import type { CaseRun } from './types';

export interface FixVerdict {
  caseID: string;
  findingID: string;
  expected: CaseFix['expected'];

  verdict: CaseFix['expected'] | 'unjudged';
  reason: string;
}

export function collectFixVerdicts(cases: readonly Case[], runs: readonly CaseRun[]): FixVerdict[] {
  return runs.flatMap((run) => {
    const corpusCase = cases.find((candidate) => candidate.id === run.caseID);

    return (corpusCase?.fixes ?? []).map((fix): FixVerdict => {
      const check = run.review.fixChecks?.find((item) => item.findingID === fix.id);

      return {
        caseID: run.caseID,
        findingID: fix.id,
        expected: fix.expected,
        verdict: pickVerdict(check?.fixed ?? null),
        reason: check?.reason ?? 'no fix check ran',
      };
    });
  });
}

function pickVerdict(fixed: boolean | null): FixVerdict['verdict'] {
  if (fixed === null) {
    return 'unjudged';
  }

  return fixed ? 'fixed' : 'not-fixed';
}
