import type { Disposition } from '@noslop/contract';
import { dispositionSchema } from '@noslop/contract';
import type { Store } from './load-store';

export async function readDispositions(
  store: Store,
  repo: string,
  pullRequest: number,
): Promise<Disposition[]> {
  const rows = await store
    .selectFrom('dispositions')
    .selectAll()
    .where('repo', '=', repo)
    .where('pull_request', '=', pullRequest)
    .orderBy('at')
    .orderBy('finding_id')
    .orderBy('source')
    .execute();

  return rows.map((row) =>
    dispositionSchema.parse({
      findingID: row.finding_id,
      kind: row.kind,
      value: row.value,
      author: row.author,
      authorIsOwner: row.author_is_owner === 1,
      source: row.source,
      at: row.at,
    }),
  );
}
