import type { ReviewResult } from '@noslop/contract';

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

  for (const file of result.notReviewed) {
    lines.push(
      `not reviewed: ${file.reason === 'data' ? 'data file' : 'too large'}: ${formatPath(file.path)}`,
    );
  }

  return `${lines.join('\n')}\n`;
}

// A path comes from the change under review, and a raw control character such as a terminal escape
// would act on the reader's terminal.
function formatPath(path: string): string {
  return path.replaceAll(
    /\p{Cc}/gu,
    (char) => `\\u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`,
  );
}
