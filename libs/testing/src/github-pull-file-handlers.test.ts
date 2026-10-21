import { expect, test } from 'bun:test';
import { githubCollections } from './github-collections';
import { GITHUB_API_URL } from './github-handlers';

test('it lists the files of a pull request in pages and leaves out the files of another', async () => {
  for (const file of [
    { number: 5, path: 'src/a.ts', blobSha: 'a'.repeat(40) },
    { number: 5, path: 'src/a.test.ts', blobSha: 'b'.repeat(40) },
    { number: 6, path: 'src/b.ts', blobSha: 'c'.repeat(40) },
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
    [{ filename: 'src/a.ts', status: 'modified', sha: 'a'.repeat(40) }],
    [{ filename: 'src/a.test.ts', status: 'modified', sha: 'b'.repeat(40) }],
  ]);
});

test('it lists the patch and the earlier path of a renamed file', async () => {
  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/b.ts',
    status: 'renamed',
    previousPath: 'src/a.ts',
    patch: '@@ -1 +1 @@\n-one\n+two',
    blobSha: 'a'.repeat(40),
  });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/pulls/5/files`);
  const files: unknown = await response.json();

  expect(files).toStrictEqual([
    {
      filename: 'src/b.ts',
      status: 'renamed',
      sha: 'a'.repeat(40),
      previous_filename: 'src/a.ts',
      patch: '@@ -1 +1 @@\n-one\n+two',
    },
  ]);
});

test('it lists no more than 3,000 files of a pull request and counts every file it changes', async () => {
  await githubCollections.pullRequests.create({ owner: 'example', repo: 'app', number: 5 });

  await Promise.all(
    Array.from({ length: 3001 }, (_, index) =>
      githubCollections.pullFiles.create({
        owner: 'example',
        repo: 'app',
        number: 5,
        path: `src/file-${index}.ts`,
      }),
    ),
  );

  const responses = await Promise.all(
    [30, 31].map((page) =>
      fetch(`${GITHUB_API_URL}/repos/example/app/pulls/5/files?per_page=100&page=${page}`),
    ),
  );

  const pages: unknown[] = await Promise.all(responses.map((response) => response.json()));
  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/pulls/5`);
  const pull: unknown = await response.json();

  expect(pages[0]).toBeArrayOfSize(100);
  expect(pages[1]).toBeArrayOfSize(0);
  expect(pull).toMatchObject({ changed_files: 3001 });
});
