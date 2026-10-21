import type { Store } from './load-store';

export interface StoredReview {
  base: string;
  head: string;
  isLensReview: boolean;
}

export async function readPullRequestReviews(
  store: Store,
  repo: string,
  pullRequest: number,
): Promise<StoredReview[]> {
  const rows = await store
    .selectFrom('reviews')
    .select(['base', 'head', 'lenses'])
    .where('repo', '=', repo)
    .where('pull_request', '=', pullRequest)
    .orderBy('started_at', 'desc')
    .orderBy('review_id', 'desc')
    .execute();

  return rows.map((row) => ({ base: row.base, head: row.head, isLensReview: row.lenses !== '[]' }));
}
