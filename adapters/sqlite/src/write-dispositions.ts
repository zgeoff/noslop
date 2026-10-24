import type { Disposition } from '@noslop/contract';
import type { Store } from './load-store';

export async function writeDispositions(
  store: Store,
  repo: string,
  pullRequest: number,
  dispositions: readonly Disposition[],
): Promise<void> {
  if (dispositions.length === 0) {
    return;
  }

  await store
    .insertInto('dispositions')
    .values(
      dispositions.map((disposition) => ({
        repo,
        pull_request: pullRequest,
        finding_id: disposition.findingID,
        kind: disposition.kind,
        value: disposition.value,
        author: disposition.author,
        author_is_owner: disposition.authorIsOwner ? 1 : 0,
        source: disposition.source,
        at: disposition.at,
      })),
    )
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}
