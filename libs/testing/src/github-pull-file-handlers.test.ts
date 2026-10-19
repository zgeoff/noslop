import { expect, test } from 'bun:test';
import { githubCollections } from './github-collections';
import { GITHUB_API_URL } from './github-handlers';

test('it lists the files of a pull request in pages and leaves out the files of another', async () => {
  for (const file of [
    { number: 5, path: 'src/a.ts' },
    { number: 5, path: 'src/a.test.ts' },
    { number: 6, path: 'src/b.ts' },
  ]) {
    await githubCollections.pullFiles.create({ owner: 'example', repo: 'app', ...file });
  }

  const responses = await Promise.all(
    [1, 2].map((page) =>
      fetch(`${GITHUB_API_URL}/repos/example/app/pulls/5/files?per_page=1&page=${page}`),
    ),
  );

  const pages: unknown[] = await Promise.all(responses.map((response) => response.json()));

  expect(pages).toStrictEqual([
    [{ filename: 'src/a.ts', status: 'modified' }],
    [{ filename: 'src/a.test.ts', status: 'modified' }],
  ]);
});
