import type { ReviewResult } from '@noslop/contract';
import type { Store } from '../store/load-store';
import type { DispositionRow } from '../store/store-tables';
import { seedDispositionWithoutPullRequest } from './seed-disposition-without-pull-request';
import { seedUnreadableFinding } from './seed-unreadable-finding';

export interface StoreSeedDeps {
  store: Store;
}

export function buildStoreSeeder(deps: StoreSeedDeps) {
  return {
    dispositionWithoutPullRequest: (input?: Partial<DispositionRow>) =>
      seedDispositionWithoutPullRequest(deps.store, input),
    unreadableFinding: (input?: Partial<ReviewResult>) => seedUnreadableFinding(deps.store, input),
  };
}
