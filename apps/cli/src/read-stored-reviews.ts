import type { Store, StoredReview } from '@noslop/sqlite';
import { readPullRequestReviews } from '@noslop/sqlite';

export interface StoreAccess {
  probeFile: (path: string) => Promise<boolean>;
  loadStore: (path: string) => Promise<Store>;
}

// a user with no store yet has none, and the run makes no store to find that out
export async function readStoredReviews(
  access: StoreAccess,
  path: string,
  repo: string,
  pullRequest: number,
): Promise<StoredReview[]> {
  const exists = await access.probeFile(path);

  if (!exists) {
    return [];
  }

  const store = await access.loadStore(path);

  try {
    return await readPullRequestReviews(store, repo, pullRequest);
  } finally {
    await store.destroy();
  }
}
