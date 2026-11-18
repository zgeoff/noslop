import type { Store } from '../store/load-store';
import { buildStoreSeeder } from './build-store-seeder';

export interface TestDeps {
  store: Store;
}

export function buildSeeder(deps: TestDeps) {
  return { ...buildStoreSeeder(deps) };
}
