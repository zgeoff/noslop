import type { Finding } from '@noslop/contract';

export function buildMockFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: '0123456789abcdef',
    lens: 'correctness',
    callID: 'light',
    title: 'Return the total of every item',
    body: 'The loop skips the first item.',
    anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
    severity: 'P2',
    criterion: 'wrong-behaviour-edge-path',
    verdict: 'CONFIRMED',
    writtenByChange: true,
    ...overrides,
  };
}
