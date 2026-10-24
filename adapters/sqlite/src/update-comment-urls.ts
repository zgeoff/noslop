import type { Store } from './load-store';

export async function updateCommentURLs(
  store: Store,
  repo: string,
  pullRequest: number,
  links: ReadonlyMap<string, string>,
): Promise<void> {
  await store.transaction().execute(async (transaction) => {
    for (const [findingID, url] of links) {
      await transaction
        .updateTable('findings')
        .set({ comment_url: url })
        .where('finding_id', '=', findingID)
        .where('review_id', 'in', (reviews) =>
          reviews
            .selectFrom('reviews')
            .select('review_id')
            .where('repo', '=', repo)
            .where('pull_request', '=', pullRequest),
        )
        .execute();
    }
  });
}
