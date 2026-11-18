import type { Store } from '@noslop/sqlite';
import { buildStoreSeeder } from '@noslop/sqlite/test-utils/build-store-seeder';

export interface TestDeps {
  store: Store;
}

export function buildSeeder(deps: TestDeps) {
  return { ...buildStoreSeeder(deps) };
}
