import type { ReviewResult } from '@noslop/contract';

// the review for a person: what ran, then each finding with its anchor, then each failed call
export function formatReviewSummary(result: ReviewResult): string {
  const lines = [
    `noslop reviewed ${result.head.slice(0, 12)} at ${result.depth} with ${result.calls.length} calls`,
    `lenses: ${result.lenses.length === 0 ? 'none' : result.lenses.join(', ')}`,
    '',
  ];

  for (const finding of result.findings) {
    const anchor = `${finding.anchor.path}:${finding.anchor.startLine}`;

    lines.push(
      `${finding.severity} ${finding.verdict} ${anchor} [${finding.lens}] ${finding.title}`,
    );
  }

  if (result.findings.length === 0) {
    lines.push('no findings');
  }

  for (const call of result.failedCalls) {
    lines.push(`failed call ${call.id} (${call.lenses.join(', ')}): ${call.reason}`);
  }

  return `${lines.join('\n')}\n`;
}
