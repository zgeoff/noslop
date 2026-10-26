import type { Finding } from '@noslop/contract';
import type { FindingMarker, FoldedFinding } from './finding-marker';
import { formatFindingHeading } from './format-finding-heading';
import { formatMarker } from './format-marker';

export const DISPOSITION_FORMS =
  'Reply with one of these as the first line: `fixed` or `fixed <sha>`, `not-a-defect <reason>`, `deferred <issue>` or `accepted-risk <reason>`.';

export function formatFindingComment(
  finding: Finding,
  head: string,
  folded: readonly Finding[] = [],
): string {
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

  if (folded.length > 0) {
    lines.push(
      '',
      `<details><summary>The same finding at ${folded.length} more places, which one reply answers</summary>`,
      '',
      ...folded.map(
        (other) =>
          `- \`${other.anchor.path}:${other.anchor.startLine}-${other.anchor.endLine}\` \`${other.id}\``,
      ),
      '</details>',
    );
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
    formatMarker('finding', toFindingMarker(finding, head, folded)),
  );

  return lines.join('\n');
}

function toFindingMarker(
  finding: Finding,
  head: string,
  folded: readonly Finding[],
): FindingMarker {
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
    ...(folded.length === 0 ? {} : { folded: folded.map((other) => toFoldedFinding(other)) }),
  };
}

function toFoldedFinding(finding: Finding): FoldedFinding {
  return {
    id: finding.id,
    title: finding.title,
    path: finding.anchor.path,
    startLine: finding.anchor.startLine,
    line: finding.anchor.endLine,
    riskClass: finding.riskClass ?? null,
    writtenByChange: finding.writtenByChange,
  };
}
