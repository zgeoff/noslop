import type { Disposition } from '@noslop/contract';
import type { Store } from './load-store';

// records each disposition a source read; a disposition the store holds already, from the same source
// at the same time, is left as it is, so reading one thread twice records it once
export async function writeDispositions(
  store: Store,
  dispositions: readonly Disposition[],
): Promise<void> {
  if (dispositions.length === 0) {
    return;
  }

  await store
    .insertInto('dispositions')
    .values(
      dispositions.map((disposition) => ({
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
