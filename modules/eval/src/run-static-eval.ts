import type { Depth, SpecialChange } from '@noslop/contract';
import { runConcurrently } from '@noslop/runner';
import type { Case } from './case';

// what routing plans for a case with no model call: its depth, the calls of its first pass, and the
// most calls the review can make once the depth's own passes are counted
export interface CasePlan {
  depth: Depth;
  special: SpecialChange | null;
  calls: string[];
  maxCalls: number;
}

export interface CasePlanner {
  planCase: (corpusCase: Case) => Promise<CasePlan>;
}

// a case whose plan threw holds no plan
export interface StaticRun {
  caseID: string;
  plan: CasePlan | null;
}

export interface RunStaticEvalOptions {
  cases: readonly Case[];
  planner: CasePlanner;
  parallel: number;
}

// plans each case at its head with no model call, so the depth the risk score picks can be read on
// every case of a corpus; the runs keep the order of the cases
export function runStaticEval(options: RunStaticEvalOptions): Promise<StaticRun[]> {
  return runConcurrently(options.cases, options.parallel, async (corpusCase) => {
    const plan = await options.planner.planCase(corpusCase).catch(() => null);

    return { caseID: corpusCase.id, plan };
  });
}
