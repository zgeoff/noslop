import type { Logger } from '@logtape/logtape';
import type { Finding, PullRequestRef } from '@noslop/contract';
import { loadStore, readRecordedFindings } from '@noslop/sqlite';
import cliPackage from '../package.json' with { type: 'json' };

export function makeRecordedFindingReader(
  path: string,
  logger: Logger,
): (pr: PullRequestRef) => Promise<Finding[]> {
  return async (pr) => {
    try {
      const store = await loadStore(path, { version: cliPackage.version });

      try {
        const recorded = await readRecordedFindings(store, `${pr.owner}/${pr.repo}`, pr.number);

        if (recorded.unreadable > 0) {
          logger.warn(
            'recorded findings of {pr} that break the finding contract, so the review posts none of them: {count}',
            {
              count: recorded.unreadable,
              pr: pr.number,
            },
          );
        }

        return recorded.findings;
      } finally {
        await store.destroy();
      }
    } catch (error) {
      logger.warn('no recorded finding of {pr} read from the store: {error}', {
        pr: pr.number,
        error,
      });

      return [];
    }
  };
}
