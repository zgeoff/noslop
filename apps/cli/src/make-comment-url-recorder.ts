import type { Logger } from '@logtape/logtape';
import type { PullRequestRef } from '@noslop/contract';
import { loadStore, updateCommentURLs } from '@noslop/sqlite';
import cliPackage from '../package.json' with { type: 'json' };

// the github reporter's hook that keeps the link to each finding's comment in the store at the path,
// beside the review the sqlite reporter wrote before it; a failure only logs, since the post and its
// check are done
export function makeCommentURLRecorder(
  path: string,
  logger: Logger,
): (pr: PullRequestRef, links: ReadonlyMap<string, string>) => Promise<void> {
  return async (pr, links) => {
    try {
      const store = await loadStore(path, { version: cliPackage.version });

      try {
        await updateCommentURLs(store, `${pr.owner}/${pr.repo}`, pr.number, links);
      } finally {
        await store.destroy();
      }
    } catch (error) {
      logger.warn('no comment links kept for {pr}: {error}', { pr: pr.number, error });
    }
  };
}
