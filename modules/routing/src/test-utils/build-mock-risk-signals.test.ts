import { expect, test } from 'bun:test';
import { buildMockRiskSignals } from './build-mock-risk-signals';

test('it builds default risk signals', () => {
  expect(buildMockRiskSignals()).toStrictEqual({
    riskClasses: [],
    detectors: [],
    packagesTouched: 1,
    consumerEdges: 0,
    changedLines: 1,
    deletedLines: 0,
    breaking: false,
    pastEscapes: [],
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockRiskSignals({ riskClasses: ['auth'], breaking: true })).toMatchObject({
    riskClasses: ['auth'],
    breaking: true,
    packagesTouched: 1,
  });
});
