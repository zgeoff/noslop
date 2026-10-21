import type { Store } from './load-store';

// the base the first review of a pull request read, which a lower stack layer's commits sit below;
// a later review's base is the head of the review before it, a commit of the pull request itself
export async function readFirstReviewBase(
  store: Store,
  repo: string,
  pullRequest: number,
): Promise<string | null> {
  const row = await store
    .selectFrom('reviews')
    .select('base')
    .where('repo', '=', repo)
    .where('pull_request', '=', pullRequest)
    .orderBy('started_at')
    .orderBy('review_id')
    .limit(1)
    .executeTakeFirst();

  return row?.base ?? null;
}
