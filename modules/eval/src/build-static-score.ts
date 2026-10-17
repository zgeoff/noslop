import type { Depth } from '@noslop/contract';
import type { Case } from './case';
import type { StaticRun } from './run-static-eval';

export interface DepthTotals {
  cases: number;

  // the true positives labelled P1 that the cases at this depth hold
  labelledP1s: number;
  escapes: number;
  groupCalls: number;
  maxCalls: number;
}

// a labelled P1 or an escape on a case that routed to Light, which Light reviews with the least effort
export interface LightMiss {
  caseID: string;
  kind: 'p1' | 'escape';
  text: string;
}

export interface CaseCalls {
  caseID: string;
  depth: Depth;
  groupCalls: number;
  maxCalls: number;
}

export interface StaticScore {
  cases: number;
  failed: number;
  depths: Record<Depth, DepthTotals>;
  lightMisses: LightMiss[];
  perCase: CaseCalls[];
}

// counts the cases, labels and planned calls at each depth, and lists every labelled P1 and escape that
// falls at Light, each a case the Light rule must keep out of Light
export function buildStaticScore(cases: readonly Case[], runs: readonly StaticRun[]): StaticScore {
  const byID = new Map(cases.map((item) => [item.id, item]));

  const score: StaticScore = {
    cases: runs.length,
    failed: 0,
    depths: { light: buildEmptyTotals(), standard: buildEmptyTotals(), deep: buildEmptyTotals() },
    lightMisses: [],
    perCase: [],
  };

  for (const run of runs) {
    const corpusCase = byID.get(run.caseID);

    if (run.plan === null || corpusCase === undefined) {
      score.failed += 1;
      continue;
    }

    const p1s = corpusCase.findings.filter(
      (finding) => finding.label === 'true-positive' && finding.severity === 'P1',
    );

    const totals = score.depths[run.plan.depth];

    totals.cases += 1;
    totals.labelledP1s += p1s.length;
    totals.escapes += corpusCase.escapes.length;
    totals.groupCalls += run.plan.calls.length;
    totals.maxCalls += run.plan.maxCalls;

    score.perCase.push({
      caseID: run.caseID,
      depth: run.plan.depth,
      groupCalls: run.plan.calls.length,
      maxCalls: run.plan.maxCalls,
    });

    if (run.plan.depth === 'light') {
      score.lightMisses.push(
        ...p1s.map((finding) => ({ caseID: run.caseID, kind: 'p1' as const, text: finding.title })),
        ...corpusCase.escapes.map((escape) => ({
          caseID: run.caseID,
          kind: 'escape' as const,
          text: escape.defect,
        })),
      );
    }
  }

  return score;
}

function buildEmptyTotals(): DepthTotals {
  return { cases: 0, labelledP1s: 0, escapes: 0, groupCalls: 0, maxCalls: 0 };
}
