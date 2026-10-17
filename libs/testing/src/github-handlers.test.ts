import { expect, test } from 'bun:test';
import { githubCollections } from './github-collections';
import { GITHUB_API_URL, STUB_APP_LOGIN } from './github-handlers';

test('it refuses a review comment on a line outside the pull request diff', async () => {
  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1, 2],
  });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/pulls/5/reviews`, {
    method: 'POST',
    body: JSON.stringify({
      commit_id: 'b'.repeat(40),
      event: 'COMMENT',
      comments: [{ path: 'src/a.ts', line: 9, body: 'x' }],
    }),
  });

  expect(response.status).toBe(422);
  expect(githubCollections.reviewComments.all()).toStrictEqual([]);
});

test('it stores the comments of a review as the App and serves them back in pages', async () => {
  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1, 2, 3],
  });

  await fetch(`${GITHUB_API_URL}/repos/example/app/pulls/5/reviews`, {
    method: 'POST',
    body: JSON.stringify({
      commit_id: 'b'.repeat(40),
      event: 'COMMENT',
      comments: [1, 2, 3].map((line) => ({ path: 'src/a.ts', line, body: `line ${line}` })),
    }),
  });

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/pulls/5/comments?page=2&per_page=2`,
  );

  const page: unknown = await response.json();

  expect(page).toMatchObject([
    { line: 3, body: 'line 3', user: { login: STUB_APP_LOGIN, type: 'Bot' } },
  ]);
});

test('it answers a reply to a comment that does not exist with not found', async () => {
  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/pulls/5/comments/123/replies`, {
    method: 'POST',
    body: JSON.stringify({ body: 'x' }),
  });

  expect(response.status).toBe(404);
});

test('it numbers a new issue after the highest issue of the repo', async () => {
  await githubCollections.issues.create({ owner: 'example', repo: 'app', number: 41 });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Follow up' }),
  });

  const issue: unknown = await response.json();

  expect(issue).toStrictEqual({ number: 42, title: 'Follow up' });
});

test('it gives a user with no collaborator record no permission', async () => {
  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/collaborators/stranger/permission`,
  );

  const permission: unknown = await response.json();

  expect(permission).toStrictEqual({ permission: 'none' });
});
