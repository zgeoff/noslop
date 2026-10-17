import type { Finding } from '@noslop/contract';
import type { FindingMarker } from './finding-marker';
import { formatMarker } from './format-marker';

export const DISPOSITION_FORMS =
  'Reply with one of these as the first line: `fixed <sha>`, `not-a-defect <reason>`, `deferred <issue>` or `accepted-risk <reason>`.';

// the comment for one finding: the severity and the verdict, the title, the body, the fact a
// PLAUSIBLE finding rests on, the fix, the finding's id and the accepted dispositions, then the marker
export function formatFindingComment(finding: Finding): string {
  const lines = [`**${finding.severity} · ${finding.verdict}** ${finding.title}`, '', finding.body];

  if (finding.unverifiedFact !== undefined) {
    lines.push('', `**Unverified fact:** ${finding.unverifiedFact}`);
  }

  if (finding.fix !== undefined) {
    lines.push('', `**Fix:** ${finding.fix}`);
  }

  lines.push(
    '',
    `noslop \`${finding.id}\` · ${finding.lens} · ${finding.rule ?? finding.criterion}`,
    DISPOSITION_FORMS,
    formatMarker('finding', toFindingMarker(finding)),
  );

  return lines.join('\n');
}

function toFindingMarker(finding: Finding): FindingMarker {
  return {
    id: finding.id,
    title: finding.title,
    lens: finding.lens,
    severity: finding.severity,
    riskClass: finding.riskClass ?? null,
    writtenByChange: finding.writtenByChange,
  };
}
