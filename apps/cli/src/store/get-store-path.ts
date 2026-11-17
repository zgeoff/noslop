import { join } from 'node:path';
import type { ReviewConfig } from '@noslop/contract';
import type { CLIContext } from '../context/cli-context';

export function getStorePath(config: ReviewConfig, ctx: CLIContext): string {
  return config.reporters['sqlite']?.path ?? join(ctx.dataDir, 'store.sqlite');
}
