import type { ReviewResult } from '@noslop/contract';
import { formatMarker } from './format-marker';
import type { SummaryMarker } from './summary-marker';

export interface FixConfirmation {
  id: string;
  title: string;
  fixed: boolean;
}

// the summary comment: the reviewed head, the depth, the lenses that ran, any failed call, and on a
// re-review whether each `fixed` finding is fixed, then the marker the next run reads
export function formatSummaryComment(
  result: ReviewResult,
  marker: SummaryMarker,
  confirmations: readonly FixConfirmation[],
): string {
  const depth =
    result.steppedUpFrom === null
      ? result.depth
      : `${result.depth}, stepped up from ${result.steppedUpFrom}`;

  const kind = marker.reviews === 1 ? 'Reviewed' : `Re-reviewed (review ${marker.reviews})`;

  const lines = [
    '### noslop',
    '',
    `${kind} \`${result.head.slice(0, 12)}\` against \`${result.base.slice(0, 12)}\` at ${depth} depth.`,
    '',
    `- Lenses: ${result.lenses.length === 0 ? 'none' : result.lenses.join(', ')}`,
    `- Findings: ${result.findings.length}`,
  ];

  if (result.special !== null) {
    lines.push(`- Special change: ${result.special}`);
  }

  for (const call of result.failedCalls) {
    lines.push(`- Failed call \`${call.id}\` (${call.lenses.join(', ')}): ${call.reason}`);
  }

  if (confirmations.length > 0) {
    lines.push('', '**Fixes**', '');

    for (const item of confirmations) {
      lines.push(`- \`${item.id}\` ${item.title}: ${item.fixed ? 'fixed' : 'not fixed'}`);
    }
  }

  lines.push('', formatMarker('summary', marker));

  return lines.join('\n');
}
