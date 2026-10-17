import type { Finding } from '@noslop/contract';

// the prompt of the merge pass, which reads the findings alone and returns the groups of IDs that
// report one defect; it never sees the code, so it judges each pair by what the findings say
export function buildMergePrompt(findings: readonly Finding[]): string {
  return [
    'The findings below come from separate reviewers of one change, and some report the same defect.',
    'Group the findings that report one defect: the same cause in the same file, which one fix',
    'removes. Read no files, and judge from the findings alone.',
    '',
    '1. Group only findings whose anchors name the same file.',
    '2. Two findings about different inputs, paths or outputs are different defects, whatever their titles share.',
    '3. A finding that asks for a test is a different defect from one that asks for a fix.',
    '4. Return only groups of 2 or more finding IDs, and leave every other finding out.',
    '5. Put each ID in one group at most.',
    '',
    '```json',
    JSON.stringify(
      findings.map((finding) => ({
        id: finding.id,
        lens: finding.lens,
        title: finding.title,
        body: finding.body,
        anchor: finding.anchor,
      })),
      null,
      2,
    ),
    '```',
  ].join('\n');
}
