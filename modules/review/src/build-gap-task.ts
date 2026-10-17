import type { Finding } from '@noslop/contract';
import { buildTaskFinding } from './build-verify-task';

// the closing task of the gap sweep at Deep, which looks for what the findings so far miss
export function buildGapTask(findings: readonly Finding[]): string {
  return [
    'Earlier passes reported the findings below. Look for the defects they miss:',
    '',
    '1. Read every hunk again, with the findings in mind.',
    '2. Report only a defect that no finding below covers.',
    '',
    '```json',
    JSON.stringify(
      findings.map((finding) => buildTaskFinding(finding)),
      null,
      2,
    ),
    '```',
  ].join('\n');
}
