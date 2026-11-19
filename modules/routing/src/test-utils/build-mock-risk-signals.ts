import type { RiskSignals } from '@noslop/contract';

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
