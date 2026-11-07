import type { Finding } from '@noslop/contract';
import { findingSchema } from '@noslop/contract';
import type { Store } from './load-store';

export interface RecordedFindings {
  findings: Finding[];
  unreadable: number;
}

export async function readRecordedFindings(
  store: Store,
  repo: string,
  pullRequest: number,
): Promise<RecordedFindings> {
  const rows = await store
    .selectFrom('findings')
    .innerJoin('reviews', 'reviews.review_id', 'findings.review_id')
    .selectAll('findings')
    .select('reviews.head')
    .where('reviews.repo', '=', repo)
    .where('reviews.pull_request', '=', pullRequest)
    .orderBy('reviews.started_at', 'desc')
    .orderBy('findings.finding_id')
    .execute();

  const seen = new Set<string>();

  const findings: Finding[] = [];
  let unreadable = 0;

  for (const row of rows) {
    if (seen.has(row.finding_id)) {
      continue;
    }

    seen.add(row.finding_id);

    const secondLocation: unknown =
      row.second_location === null ? undefined : JSON.parse(row.second_location);

    const parsed = findingSchema.safeParse({
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

    if (parsed.success) {
      findings.push(parsed.data);
    } else {
      unreadable += 1;
    }
  }

  return { findings, unreadable };
}
