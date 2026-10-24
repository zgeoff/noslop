import type { Depth, SpecialChange } from '@noslop/contract';
import { runConcurrently } from '@noslop/runner';
import type { Case } from './case';

export interface CasePlan {
  depth: Depth;
  special: SpecialChange | null;
  calls: string[];
  maxCalls: number;
}

export interface CasePlanner {
  planCase: (corpusCase: Case) => Promise<CasePlan>;
}

export interface StaticRun {
  caseID: string;
  plan: CasePlan | null;
}

export interface RunStaticEvalOptions {
  cases: readonly Case[];
  planner: CasePlanner;
  parallel: number;
}

export function runStaticEval(options: RunStaticEvalOptions): Promise<StaticRun[]> {
  return runConcurrently(options.cases, options.parallel, async (corpusCase) => {
    const plan = await options.planner.planCase(corpusCase).catch(() => null);

    return { caseID: corpusCase.id, plan };
  });
}
