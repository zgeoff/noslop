import type { Finding, ReviewResult } from '@noslop/contract';

export interface UnpostedInput {
  posted: ReadonlySet<string>;
  recorded: readonly Finding[];
  unreadable: number;
}

export function collectUnpostedFindings(input: UnpostedInput, result: ReviewResult): Finding[] {
  if (input.unreadable > 0) {
    return [];
  }

  const reported = new Set(result.findings.map((finding) => finding.id));

  return input.recorded.filter(
    (finding) => !input.posted.has(finding.id) && !reported.has(finding.id),
  );
}
