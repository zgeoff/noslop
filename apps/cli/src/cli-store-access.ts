import { loadStore } from '@noslop/sqlite';
import cliPackage from '../package.json' with { type: 'json' };
import type { StoreAccess } from './read-stored-reviews';

export const cliStoreAccess: StoreAccess = {
  probeFile: (path) => Bun.file(path).exists(),
  loadStore: (path) => loadStore(path, { version: cliPackage.version }),
};
