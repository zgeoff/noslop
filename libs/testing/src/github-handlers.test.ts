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

test('it serves the lines a moved review comment had when it was posted beside its current lines', async () => {
  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    startLine: 40,
    line: 42,
    originalStartLine: 10,
    originalLine: 12,
  });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/pulls/5/comments`);
  const comments: unknown = await response.json();

  expect(comments).toMatchObject([
    { start_line: 40, line: 42, original_start_line: 10, original_line: 12 },
  ]);
});

test('it serves the current lines as the posted lines of a review comment that has not moved', async () => {
  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    startLine: 3,
    line: 4,
  });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/pulls/5/comments`);
  const comments: unknown = await response.json();

  expect(comments).toMatchObject([
    { start_line: 3, line: 4, original_start_line: 3, original_line: 4 },
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

  expect(compare).toStrictEqual({
    status: 'ahead',
    merge_base_commit: { sha: 'a'.repeat(40) },
    commits: [{ sha: 'b'.repeat(40) }, { sha: 'c'.repeat(40) }],
    files: [],
  });
});

test('it compares a short base sha as the commit it starts', async () => {
  for (const sha of ['a', 'b', 'c']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      sha: sha.repeat(40),
    });
  }

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/compare/bbbbbbb...${'c'.repeat(40)}`,
  );

  const compare: unknown = await response.json();

  expect(compare).toStrictEqual({
    status: 'ahead',
    merge_base_commit: { sha: 'b'.repeat(40) },
    commits: [{ sha: 'c'.repeat(40) }],
    files: [],
  });
});

test('it compares a base after the head as behind, with the head as the merge base', async () => {
  for (const sha of ['a', 'b', 'c']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      sha: sha.repeat(40),
    });
  }

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/compare/${'c'.repeat(40)}...${'b'.repeat(40)}`,
  );

  const compare: unknown = await response.json();

  expect(compare).toStrictEqual({
    status: 'behind',
    merge_base_commit: { sha: 'b'.repeat(40) },
    commits: [],
    files: [],
  });
});

test('it compares a commit off the branch with a branch commit as diverged, listing the branch line', async () => {
  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false },
    { sha: 'b'.repeat(40), isOnBranch: true },
    { sha: 'c'.repeat(40), isOnBranch: true },
  ]) {
    await githubCollections.pullCommits.create({ owner: 'example', repo: 'app', ...commit });
  }

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/compare/${'a'.repeat(40)}...${'c'.repeat(40)}`,
  );

  const compare: unknown = await response.json();

  expect(compare).toMatchObject({
    status: 'diverged',
    commits: [{ sha: 'b'.repeat(40) }, { sha: 'c'.repeat(40) }],
  });
});

test('it compares a commit with itself as identical', async () => {
  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    sha: 'a'.repeat(40),
  });

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/compare/${'a'.repeat(40)}...${'a'.repeat(40)}`,
  );

  const compare: unknown = await response.json();

  expect(compare).toStrictEqual({
    status: 'identical',
    merge_base_commit: { sha: 'a'.repeat(40) },
    commits: [],
    files: [],
  });
});

test('it lists the first 250 commits of a compare that asks for no page', async () => {
  const shas = Array.from({ length: 260 }, (_, index) => index.toString(16).padStart(40, '0'));

  for (const sha of shas) {
    await githubCollections.pullCommits.create({ owner: 'example', repo: 'app', sha });
  }

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/compare/${shas[0] ?? ''}...${shas[259] ?? ''}`,
  );

  const compare: unknown = await response.json();

  expect(compare).toMatchObject({ commits: expect.toBeArrayOfSize(250) });
});

test('it pages the commits of a compare that asks for a page', async () => {
  for (const sha of ['a', 'b', 'c', 'd']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      sha: sha.repeat(40),
    });
  }

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/compare/${'a'.repeat(40)}...${'d'.repeat(40)}?page=2&per_page=2`,
  );

  const compare: unknown = await response.json();

  expect(compare).toMatchObject({ status: 'ahead', commits: [{ sha: 'd'.repeat(40) }] });
});

test('it answers a compare from a short sha that starts 2 commits as unprocessable', async () => {
  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    sha: 'abc1234'.padEnd(40, 'a'),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    sha: 'abc1234'.padEnd(40, 'b'),
  });

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/compare/abc1234...${'abc1234'.padEnd(40, 'b')}`,
  );

  expect(response.status).toBe(422);
});

test('it answers a compare from a short sha that names no commit with not found', async () => {
  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    sha: 'a'.repeat(40),
  });

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/compare/bbbbbbb...${'a'.repeat(40)}`,
  );

  expect(response.status).toBe(404);
});

test('it compares a full sha it holds no commit for as the base before every commit', async () => {
  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    sha: 'a'.repeat(40),
  });

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/compare/${'f'.repeat(40)}...${'a'.repeat(40)}`,
  );

  const compare: unknown = await response.json();

  expect(compare).toStrictEqual({
    status: 'ahead',
    merge_base_commit: { sha: 'f'.repeat(40) },
    commits: [{ sha: 'a'.repeat(40) }],
    files: [],
  });
});

test('it leaves a commit from the base branch out of the commits of the pull request and keeps it in a compare', async () => {
  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 3,
    sha: 'a'.repeat(40),
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 3,
    sha: 'b'.repeat(40),
    isFromBase: true,
  });

  const listed = await fetch(`${GITHUB_API_URL}/repos/example/app/pulls/3/commits`);

  const compared = await fetch(
    `${GITHUB_API_URL}/repos/example/app/compare/${'a'.repeat(40)}...${'b'.repeat(40)}`,
  );

  const commits: unknown = await listed.json();
  const compare: unknown = await compared.json();

  expect(commits).toStrictEqual([{ sha: 'a'.repeat(40) }]);
  expect(compare).toMatchObject({ status: 'ahead', commits: [{ sha: 'b'.repeat(40) }] });
});

test('it lists the files of a compared range with each rename back to its path at the base', async () => {
  for (const commit of [
    { sha: 'a'.repeat(40), files: ['src/a.ts'], renames: {} },
    { sha: 'b'.repeat(40), files: ['src/b.ts'], renames: { 'src/b.ts': 'src/a.ts' } },
    { sha: 'c'.repeat(40), files: ['data/b.ts', 'src/c.ts'], renames: { 'data/b.ts': 'src/b.ts' } },
  ]) {
    await githubCollections.pullCommits.create({ owner: 'example', repo: 'app', ...commit });
  }

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/compare/${'a'.repeat(40)}...${'c'.repeat(40)}`,
  );

  const compare: unknown = await response.json();

  expect(compare).toStrictEqual({
    status: 'ahead',
    merge_base_commit: { sha: 'a'.repeat(40) },
    commits: [{ sha: 'b'.repeat(40) }, { sha: 'c'.repeat(40) }],
    files: [
      { filename: 'data/b.ts', status: 'renamed', previous_filename: 'src/a.ts' },
      { filename: 'src/c.ts' },
    ],
  });
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

test('it serves the files of a commit in pages', async () => {
  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    sha: 'a'.repeat(40),
    files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
  });

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/commits/aaaaaaa?page=2&per_page=2`,
  );

  const commit: unknown = await response.json();

  expect(commit).toStrictEqual({ sha: 'a'.repeat(40), files: [{ filename: 'src/c.ts' }] });
});

test('it names the path a renamed file of a commit had before', async () => {
  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    sha: 'a'.repeat(40),
    files: ['src/b.ts'],
    renames: { 'src/b.ts': 'src/a.ts' },
  });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/commits/aaaaaaa`);
  const commit: unknown = await response.json();

  expect(commit).toStrictEqual({
    sha: 'a'.repeat(40),
    files: [{ filename: 'src/b.ts', status: 'renamed', previous_filename: 'src/a.ts' }],
  });
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

test('it lists the issues of a repo with their authors, the App for an issue it opened', async () => {
  await githubCollections.issues.create({
    owner: 'example',
    repo: 'app',
    number: 1,
    title: 'Close the old file',
    body: 'Found after the re-check.',
    authorLogin: 'dev',
  });

  await fetch(`${GITHUB_API_URL}/repos/example/app/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Await the write', body: 'Filed by the App.' }),
  });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/issues?page=1&per_page=30`);
  const issues: unknown = await response.json();

  expect(issues).toStrictEqual([
    {
      number: 1,
      title: 'Close the old file',
      body: 'Found after the re-check.',
      user: { login: 'dev' },
    },
    {
      number: 2,
      title: 'Await the write',
      body: 'Filed by the App.',
      user: { login: STUB_APP_LOGIN },
    },
  ]);
});

test('it names the App as its slug', async () => {
  const response = await fetch(`${GITHUB_API_URL}/app`);
  const app: unknown = await response.json();

  expect(app).toStrictEqual({ slug: 'noslop-review' });
});

test('it gives the patch of each file of a commit that holds one', async () => {
  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    sha: 'a'.repeat(40),
    files: ['src/a.ts', 'logo.png'],
    patches: { 'src/a.ts': '@@ -1 +1 @@\n-old\n+new' },
  });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/commits/aaaaaaa`);
  const commit: unknown = await response.json();

  expect(commit).toStrictEqual({
    sha: 'a'.repeat(40),
    files: [{ filename: 'src/a.ts', patch: '@@ -1 +1 @@\n-old\n+new' }, { filename: 'logo.png' }],
  });
});

test('it serves a commit off the branch by its sha but lists it among no pull request commits', async () => {
  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'a'.repeat(40),
    files: ['src/a.ts'],
    isOnBranch: false,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'b'.repeat(40),
    files: ['src/a.ts'],
  });

  const listed = await fetch(`${GITHUB_API_URL}/repos/example/app/pulls/5/commits`);
  const single = await fetch(`${GITHUB_API_URL}/repos/example/app/commits/aaaaaaa`);
  const commits: unknown = await listed.json();

  expect(commits).toStrictEqual([{ sha: 'b'.repeat(40) }]);
  expect(single.status).toBe(200);
});
