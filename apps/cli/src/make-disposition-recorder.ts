import type { Logger } from '@logtape/logtape';
import type { Disposition, PullRequestRef } from '@noslop/contract';
import { loadStore, writeDispositions } from '@noslop/sqlite';
import cliPackage from '../package.json' with { type: 'json' };

export function makeDispositionRecorder(
  path: string,
  logger: Logger,
): (pullRequest: PullRequestRef, dispositions: readonly Disposition[]) => Promise<void> {
  return async (pullRequest, dispositions) => {
    try {
      const store = await loadStore(path, { version: cliPackage.version });

      try {
        await writeDispositions(
          store,
          `${pullRequest.owner}/${pullRequest.repo}`,
          pullRequest.number,
          dispositions,
        );
      } finally {
        await store.destroy();
      }
    } catch (error) {
      logger.warn('no dispositions kept for {pullRequest}: {error}', {
        pullRequest: pullRequest.number,
        error,
      });
    }
  };
}
