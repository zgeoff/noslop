import { join } from 'node:path';
import type { ReviewConfig } from '@noslop/contract';
import type { CLIContext } from './cli-context';

// the store that the sqlite reporter writes: the path its options name, or one under the user's cache
export function getStorePath(config: ReviewConfig, ctx: CLIContext): string {
  return config.reporters['sqlite']?.path ?? join(ctx.cacheDir, 'store.sqlite');
}
