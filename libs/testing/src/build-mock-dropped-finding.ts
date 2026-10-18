import type { DroppedFinding } from '@noslop/contract';

// a taste finding from call L that Assemble dropped because its quote is not in the rules file
export function buildMockDroppedFinding(overrides: Partial<DroppedFinding> = {}): DroppedFinding {
  return {
    lens: 'naming-shape-and-comments',
    callID: 'L',
    title: 'Start the name with a verb',
    anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
    criterion: 'taste-rule',
    reason: 'unknown-rule',
    rule: 'RULES.md',
    ruleQuote: 'Every name starts with a verb.',
    ...overrides,
  };
}
