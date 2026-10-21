import type { StoredReview } from '@noslop/sqlite';
import { loadStore, readPullRequestReviews } from '@noslop/sqlite';
import cliPackage from '../package.json' with { type: 'json' };

// the reviews of the pull request the store holds; a user with no store yet has none, and the run
// makes no store to find that out
export async function readStoredReviews(
  path: string,
  repo: string,
  pullRequest: number,
): Promise<StoredReview[]> {
  const exists = await Bun.file(path).exists();

  if (!exists) {
    return [];
  }

  const store = await loadStore(path, { version: cliPackage.version });

  try {
    return await readPullRequestReviews(store, repo, pullRequest);
  } finally {
    await store.destroy();
  }
}
