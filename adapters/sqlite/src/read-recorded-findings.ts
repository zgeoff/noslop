import type { Finding } from '@noslop/contract';
import { findingSchema } from '@noslop/contract';
import type { Store } from './load-store';

export async function readRecordedFindings(
  store: Store,
  repo: string,
  pullRequest: number,
): Promise<Finding[]> {
  const rows = await store
    .selectFrom('findings')
    .innerJoin('reviews', 'reviews.review_id', 'findings.review_id')
    .selectAll('findings')
    .select('reviews.head')
    .where('reviews.repo', '=', repo)
    .where('reviews.pull_request', '=', pullRequest)
    .orderBy('reviews.started_at', 'desc')
    .execute();

  const latest = new Map<string, Finding>();

  for (const row of rows) {
    if (latest.has(row.finding_id)) {
      continue;
    }

    const secondLocation: unknown =
      row.second_location === null ? undefined : JSON.parse(row.second_location);

    const finding = findingSchema.parse({
      id: row.finding_id,
      lens: row.lens,
      callID: row.call_id,
      title: row.title,
      body: row.body,
      anchor: { path: row.path, startLine: row.start_line, endLine: row.end_line },
      ...(secondLocation === undefined ? {} : { secondLocation }),
      severity: row.severity,
      criterion: row.criterion,
      ...(row.rule === null ? {} : { rule: row.rule }),
      verdict: row.verdict,
      ...(row.unverified_fact === null ? {} : { unverifiedFact: row.unverified_fact }),
      writtenByChange: row.written_by_change === 1,
      ...(row.risk_class === null ? {} : { riskClass: row.risk_class }),
      ...(row.fix === null ? {} : { fix: row.fix }),
      anchorCommit: row.anchor_commit ?? row.head,
    });

    latest.set(row.finding_id, finding);
  }

  return [...latest.values()];
}
