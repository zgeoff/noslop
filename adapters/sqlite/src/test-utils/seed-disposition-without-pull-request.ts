import type { Disposition } from '@noslop/contract';
import type { Store } from '../store/load-store';

export async function seedDispositionWithoutPullRequest(
  store: Store,
  repo: string,
  disposition: Disposition,
): Promise<void> {
  // A disposition from a store written before dispositions kept their pull request.
  await store
    .insertInto('dispositions')
    .values({
      repo,
      pull_request: null,
      finding_id: disposition.findingID,
      kind: disposition.kind,
      value: disposition.value,
      author: disposition.author,
      author_is_owner: disposition.authorIsOwner ? 1 : 0,
      source: disposition.source,
      at: disposition.at,
    })
    .execute();
}
