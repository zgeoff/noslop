import type { Logger } from '@logtape/logtape';
import type { Disposition, PullRequestRef } from '@noslop/contract';
import { loadStore, writeDispositions } from '@noslop/sqlite';
import cliPackage from '../package.json' with { type: 'json' };

export function makeDispositionRecorder(
  path: string,
  logger: Logger,
): (pr: PullRequestRef, dispositions: readonly Disposition[]) => Promise<void> {
  return async (pr, dispositions) => {
    try {
      const store = await loadStore(path, { version: cliPackage.version });

      try {
        await writeDispositions(store, `${pr.owner}/${pr.repo}`, pr.number, dispositions);
      } finally {
        await store.destroy();
      }
    } catch (error) {
      logger.warn('no dispositions kept for {pr}: {error}', { pr: pr.number, error });
    }
  };
}
