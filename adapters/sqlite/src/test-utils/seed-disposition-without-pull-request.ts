import type { Store } from '../store/load-store';
import type { DispositionRow } from '../store/store-tables';
import { buildMockDispositionRow } from './build-mock-disposition-row';

export async function seedDispositionWithoutPullRequest(
  store: Store,
  input: Partial<DispositionRow> = {},
): Promise<DispositionRow> {
  const row = { ...buildMockDispositionRow(input), pull_request: null };

  // A disposition from a store written before dispositions kept their pull request.
  await store.insertInto('dispositions').values(row).execute();

  return row;
}
