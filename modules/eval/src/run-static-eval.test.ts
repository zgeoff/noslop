import { expect, test } from 'bun:test';
import type { Case } from './case';
import type { CasePlan } from './run-static-eval';
import { runStaticEval } from './run-static-eval';

test('it plans each case in order and records a plan that throws as none', async () => {
  const plans: Record<string, Promise<CasePlan>> = {
    'case-1': Promise.resolve({ depth: 'standard', special: null, calls: ['A', 'C'], maxCalls: 3 }),
    'case-2': Promise.reject(new Error('git cannot read the head')),
  };

  const cases: Case[] = ['case-1', 'case-2'].map((id) => ({
    id,
    repo: 'repo',
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    title: 'Change a',
    body: '',
    findings: [],
    escapes: [],
  }));

  const runs = await runStaticEval({
    cases,
    parallel: 2,
    planner: {
      planCase: (corpusCase) => plans[corpusCase.id] ?? Promise.reject(new Error('no plan')),
    },
  });

  expect(runs).toStrictEqual([
    {
      caseID: 'case-1',
      plan: { depth: 'standard', special: null, calls: ['A', 'C'], maxCalls: 3 },
    },
    { caseID: 'case-2', plan: null },
  ]);
});
