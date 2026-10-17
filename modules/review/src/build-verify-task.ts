import type { Finding } from '@noslop/contract';

// the closing task of the verify pass at Deep, which re-derives each finding of the review from the
// code, in one call over the whole list
export function buildVerifyTask(findings: readonly Finding[]): string {
  return [
    'An earlier pass reported the findings below, each under its lens. Check each one again:',
    '',
    '1. Open the code the finding names, and trace its mechanism from the change.',
    '2. Report the finding again, under its lens, only when the code shows the defect.',
    '3. Correct its anchor, verdict or criterion when the code shows a different one.',
    '4. Report no finding that is not in the list.',
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

// the fields a model reads to judge a finding, without the IDs that only noslop uses
export function buildTaskFinding(finding: Finding): Record<string, unknown> {
  return {
    lens: finding.lens,
    title: finding.title,
    body: finding.body,
    anchor: finding.anchor,
    severity: finding.severity,
    criterion: finding.criterion,
    verdict: finding.verdict,
    ...(finding.unverifiedFact === undefined ? {} : { unverifiedFact: finding.unverifiedFact }),
    ...(finding.fix === undefined ? {} : { fix: finding.fix }),
  };
}
