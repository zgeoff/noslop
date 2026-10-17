import type { RiskSignals } from '@noslop/contract';

// the signals of a small change in one package that marks nothing
export function buildMockRiskSignals(overrides: Partial<RiskSignals> = {}): RiskSignals {
  return {
    riskClasses: [],
    detectors: [],
    packagesTouched: 1,
    consumerEdges: 0,
    changedLines: 1,
    deletedLines: 0,
    breaking: false,
    pastEscapes: [],
    ...overrides,
  };
}
