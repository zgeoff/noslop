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

test('it edits the body of a review comment in place', async () => {
  const comment = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'before',
  });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/pulls/comments/${comment.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: 'after' }),
  });

  expect(response.status).toBe(200);
  expect(githubCollections.reviewComments.all().map((item) => item.body)).toStrictEqual(['after']);
});

test('it answers an edit of a review comment that does not exist with not found', async () => {
  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/pulls/comments/123`, {
    method: 'PATCH',
    body: JSON.stringify({ body: 'x' }),
  });

  expect(response.status).toBe(404);
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

test('it compares 2 commits as the commits after the base up to the head', async () => {
  for (const sha of ['a', 'b', 'c', 'd']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      sha: sha.repeat(40),
    });
  }

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/compare/${'a'.repeat(40)}...${'c'.repeat(40)}`,
  );

  const compare: unknown = await response.json();

  expect(compare).toStrictEqual({ commits: [{ sha: 'b'.repeat(40) }, { sha: 'c'.repeat(40) }] });
});

test('it lists the files a commit changes and answers an unknown commit with not found', async () => {
  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    sha: 'a'.repeat(40),
    files: ['src/a.ts'],
  });

  const known = await fetch(`${GITHUB_API_URL}/repos/example/app/commits/aaaaaaa`);
  const unknown = await fetch(`${GITHUB_API_URL}/repos/example/app/commits/bbbbbbb`);
  const commit: unknown = await known.json();

  expect(commit).toStrictEqual({ sha: 'a'.repeat(40), files: [{ filename: 'src/a.ts' }] });
  expect(unknown.status).toBe(404);
});

test('it serves the commit a branch points at and answers an unknown branch with not found', async () => {
  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'release/1',
    sha: 'a'.repeat(40),
  });

  const known = await fetch(`${GITHUB_API_URL}/repos/example/app/branches/release/1`);
  const unknown = await fetch(`${GITHUB_API_URL}/repos/example/app/branches/main`);
  const branch: unknown = await known.json();

  expect(branch).toStrictEqual({ name: 'release/1', commit: { sha: 'a'.repeat(40) } });
  expect(unknown.status).toBe(404);
});

test('it names the App as its slug', async () => {
  const response = await fetch(`${GITHUB_API_URL}/app`);
  const app: unknown = await response.json();

  expect(app).toStrictEqual({ slug: 'noslop-review' });
});
