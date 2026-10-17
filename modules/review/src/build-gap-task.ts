import type { ModelFinding } from '@noslop/contract';

// the closing task of the gap sweep at Deep, which looks for what the findings so far miss
export function buildGapTask(findings: readonly ModelFinding[]): string {
  return [
    'Earlier passes of these lenses reported the findings below. Look for the defects they miss:',
    '',
    '1. Read every hunk again, with the findings in mind.',
    '2. Report only a defect that no finding below covers.',
    '',
    '```json',
    JSON.stringify(findings, null, 2),
    '```',
  ].join('\n');
}
