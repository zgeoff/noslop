import type { Store } from './load-store';

// the files of a repo where a defect escaped review before, each once, for the past-escape signal
export async function readEscapePaths(store: Store, repo: string): Promise<string[]> {
  const rows = await store
    .selectFrom('escapes')
    .select('path')
    .distinct()
    .where('repo', '=', repo)
    .where('path', 'is not', null)
    .orderBy('path')
    .execute();

  return rows.flatMap((row) => (row.path === null ? [] : [row.path]));
}
