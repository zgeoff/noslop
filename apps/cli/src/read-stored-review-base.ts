import { loadStore, readFirstReviewBase } from '@noslop/sqlite';
import cliPackage from '../package.json' with { type: 'json' };

// the base the pull request's first review read, from the store; a user with no store yet has none,
// and the run makes no store to find that out
export async function readStoredReviewBase(
  path: string,
  repo: string,
  pullRequest: number,
): Promise<string | null> {
  const exists = await Bun.file(path).exists();

  if (!exists) {
    return null;
  }

  const store = await loadStore(path, { version: cliPackage.version });

  try {
    return await readFirstReviewBase(store, repo, pullRequest);
  } finally {
    await store.destroy();
  }
}
