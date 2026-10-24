import type { Finding } from '@noslop/contract';
import type { FindingMarker } from './finding-marker';
import { formatFindingHeading } from './format-finding-heading';
import { formatMarker } from './format-marker';

export const DISPOSITION_FORMS =
  'Reply with one of these as the first line: `fixed` or `fixed <sha>`, `not-a-defect <reason>`, `deferred <issue>` or `accepted-risk <reason>`.';

export function formatFindingComment(finding: Finding, head: string): string {
  const lines = [
    formatFindingHeading(finding.severity, finding.lens, finding.title),
    '',
    finding.body,
  ];

  if (finding.unverifiedFact !== undefined) {
    lines.push('', `**Not checked:** ${finding.unverifiedFact}`);
  }

  if (finding.fix !== undefined) {
    lines.push('', `**Fix:** ${finding.fix}`);
  }

  lines.push(
    '',
    '<details><summary>Reply options</summary>',
    '',
    'Start your reply with one of: `fixed`, `fixed <sha>`, `not-a-defect <reason>`, `deferred <issue>`, `accepted-risk <reason>`.',
    '</details>',
    '<details><summary>Details</summary>',
    '',
    `Finding \`${finding.id}\` · lens ${finding.lens} · criterion ${finding.criterion} · rule ${finding.rule ?? 'none'}`,
    '</details>',
    formatMarker('finding', toFindingMarker(finding, head)),
  );

  return lines.join('\n');
}

function toFindingMarker(finding: Finding, head: string): FindingMarker {
  return {
    id: finding.id,
    title: finding.title,
    path: finding.anchor.path,
    lens: finding.lens,
    severity: finding.severity,
    riskClass: finding.riskClass ?? null,
    writtenByChange: finding.writtenByChange,
    criterion: finding.criterion,
    rule: finding.rule ?? null,
    head,
  };
}
