import type { ModelFinding } from '@noslop/contract';

// the closing task of the verify pass at Deep, which re-derives each finding from the code
export function buildVerifyTask(findings: readonly ModelFinding[]): string {
  return [
    'An earlier pass of these lenses reported the findings below. Check each one again:',
    '',
    '1. Open the code the finding names, and trace its mechanism from the change.',
    '2. Report the finding again, under its lens, only when the code shows the defect.',
    '3. Correct its anchor, verdict or criterion when the code shows a different one.',
    '4. Report no finding that is not in the list.',
    '',
    '```json',
    JSON.stringify(findings, null, 2),
    '```',
  ].join('\n');
}
