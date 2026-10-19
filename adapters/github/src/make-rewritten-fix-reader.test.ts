import { expect, test } from 'bun:test';
import { GITHUB_API_URL, githubCollections, githubServer } from '@noslop/testing';
import { HttpResponse, http } from 'msw';
import { createGitHubConnection } from './create-github-connection';
import { makeRewrittenFixReader } from './make-rewritten-fix-reader';

async function setupTest() {
  const connection = await createGitHubConnection(null);

  return {
    readRewrittenFix: makeRewrittenFixReader(connection.client, {
      owner: 'example',
      repo: 'app',
      number: 5,
    }),
  };
}

test('it finds the branch commit that holds the change of a rewritten commit at other lines', async () => {
  const ctx = await setupTest();

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false, patch: '@@ -3,1 +3,1 @@\n-old\n+new' },
    { sha: 'b'.repeat(40), isOnBranch: false, patch: '@@ -9,1 +9,1 @@ total\n-a\n+b' },
    { sha: 'c'.repeat(40), isOnBranch: true, patch: '@@ -1,1 +1,1 @@\n-x\n+y' },
    { sha: 'd'.repeat(40), isOnBranch: true, patch: '@@ -12,1 +12,1 @@ total\n-a\n+b' },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: ['src/a.ts'],
      patches: { 'src/a.ts': commit.patch },
      isOnBranch: commit.isOnBranch,
    });
  }

  const fix = await ctx.readRewrittenFix({
    sha: 'bbbbbbb',
    posted: 'a'.repeat(40),
    candidates: ['c'.repeat(40), 'd'.repeat(40)],
  });

  expect(fix).toStrictEqual({ commit: 'd'.repeat(40), failure: null });
});

test.each([
  [
    'the same file changed at other lines',
    { files: ['src/a.ts'], renames: {}, patches: { 'src/a.ts': '@@ -3,1 +3,1 @@\n-sum\n+total' } },
    { files: ['src/a.ts'], renames: {}, patches: { 'src/a.ts': '@@ -9,1 +9,1 @@\n-sum\n+total' } },
    { commit: 'c'.repeat(40), failure: null },
  ],
  [
    'the same change in another file',
    { files: ['src/a.ts'], renames: {}, patches: { 'src/a.ts': '@@ -1,1 +1,1 @@\n-sum\n+total' } },
    { files: ['src/b.ts'], renames: {}, patches: { 'src/b.ts': '@@ -1,1 +1,1 @@\n-sum\n+total' } },
    { commit: null, failure: '0 commits on the branch hold the change of the commit bbbbbbb' },
  ],
  [
    'a rename from the same origin',
    {
      files: ['src/a.ts'],
      renames: { 'src/a.ts': 'src/old.ts' },
      patches: { 'src/a.ts': '@@ -1,1 +1,1 @@\n-sum\n+total' },
    },
    {
      files: ['src/a.ts'],
      renames: { 'src/a.ts': 'src/old.ts' },
      patches: { 'src/a.ts': '@@ -4,1 +4,1 @@\n-sum\n+total' },
    },
    { commit: 'c'.repeat(40), failure: null },
  ],
  [
    'a rename from another origin',
    {
      files: ['src/a.ts'],
      renames: { 'src/a.ts': 'src/old.ts' },
      patches: { 'src/a.ts': '@@ -1,1 +1,1 @@\n-sum\n+total' },
    },
    {
      files: ['src/a.ts'],
      renames: { 'src/a.ts': 'src/other.ts' },
      patches: { 'src/a.ts': '@@ -1,1 +1,1 @@\n-sum\n+total' },
    },
    { commit: null, failure: '0 commits on the branch hold the change of the commit bbbbbbb' },
  ],
  [
    'a deleted file',
    { files: ['src/a.ts'], renames: {}, patches: { 'src/a.ts': '@@ -1,2 +0,0 @@\n-sum\n-total' } },
    { files: ['src/a.ts'], renames: {}, patches: { 'src/a.ts': '@@ -1,2 +0,0 @@\n-sum\n-total' } },
    { commit: 'c'.repeat(40), failure: null },
  ],
  [
    'an added file',
    { files: ['src/a.ts'], renames: {}, patches: { 'src/a.ts': '@@ -0,0 +1,2 @@\n+sum\n+total' } },
    { files: ['src/a.ts'], renames: {}, patches: { 'src/a.ts': '@@ -0,0 +1,2 @@\n+sum\n+total' } },
    { commit: 'c'.repeat(40), failure: null },
  ],
  [
    'a merge commit, which GitHub lists by the files it changes against its first parent',
    {
      files: ['src/a.ts', 'src/b.ts'],
      renames: {},
      patches: { 'src/a.ts': '@@ -1,1 +1,1 @@\n-a\n+b', 'src/b.ts': '@@ -1,1 +1,1 @@\n-c\n+d' },
    },
    {
      files: ['src/a.ts', 'src/b.ts'],
      renames: {},
      patches: { 'src/a.ts': '@@ -2,1 +2,1 @@\n-a\n+b', 'src/b.ts': '@@ -5,1 +5,1 @@\n-c\n+d' },
    },
    { commit: 'c'.repeat(40), failure: null },
  ],
  [
    'an empty commit',
    { files: [], renames: {}, patches: {} },
    { files: [], renames: {}, patches: {} },
    { commit: null, failure: 'GitHub gives no whole patch of the commit bbbbbbb' },
  ],
])(
  'it matches a rewritten commit of %s as GitHub lists it',
  async (_label, named, copy, expected) => {
    const ctx = await setupTest();

    for (const commit of [
      { sha: 'b'.repeat(40), isOnBranch: false, ...named },
      { sha: 'c'.repeat(40), isOnBranch: true, ...copy },
    ]) {
      await githubCollections.pullCommits.create({
        owner: 'example',
        repo: 'app',
        number: 5,
        ...commit,
      });
    }

    const fix = await ctx.readRewrittenFix({
      sha: 'bbbbbbb',
      posted: undefined,
      candidates: ['c'.repeat(40)],
    });

    expect(fix).toStrictEqual(expected);
  },
);

test('it finds no branch commit for a rewritten commit that matches in its first file but differs in its second', async () => {
  const ctx = await setupTest();

  for (const commit of [
    { sha: 'b'.repeat(40), isOnBranch: false, second: '@@ -1,1 +1,1 @@\n-x\n+y' },
    { sha: 'c'.repeat(40), isOnBranch: true, second: '@@ -1,1 +1,1 @@\n-x\n+z' },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: ['src/a.ts', 'src/b.ts'],
      patches: { 'src/a.ts': '@@ -1,1 +1,1 @@\n-old\n+new', 'src/b.ts': commit.second },
      isOnBranch: commit.isOnBranch,
    });
  }

  const fix = await ctx.readRewrittenFix({
    sha: 'bbbbbbb',
    posted: undefined,
    candidates: ['c'.repeat(40)],
  });

  expect(fix).toStrictEqual({
    commit: null,
    failure: '0 commits on the branch hold the change of the commit bbbbbbb',
  });
});

test('it finds no branch commit for a rewritten commit on a fork that diverged from the head that posted the finding', async () => {
  const ctx = await setupTest();

  for (const commit of [
    { sha: 'b'.repeat(40), isOnBranch: false },
    { sha: 'c'.repeat(40), isOnBranch: true },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: ['src/a.ts'],
      patches: { 'src/a.ts': '@@ -1,1 +1,1 @@\n-old\n+new' },
      isOnBranch: commit.isOnBranch,
    });
  }

  githubServer.use(
    http.get(
      `${GITHUB_API_URL}/repos/:owner/:repo/compare/${'a'.repeat(40)}...${'b'.repeat(40)}`,
      () =>
        HttpResponse.json({ status: 'diverged', commits: [{ sha: 'b'.repeat(40) }], files: [] }),
    ),
  );

  const fix = await ctx.readRewrittenFix({
    sha: 'bbbbbbb',
    posted: 'a'.repeat(40),
    candidates: ['c'.repeat(40)],
  });

  expect(fix).toStrictEqual({
    commit: null,
    failure: 'the commit bbbbbbb does not come after the review that posted the finding',
  });
});

test('it finds no branch commit when 2 branch commits hold the change', async () => {
  const ctx = await setupTest();

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false },
    { sha: 'c'.repeat(40), isOnBranch: true },
    { sha: 'd'.repeat(40), isOnBranch: true },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: ['src/a.ts'],
      patches: { 'src/a.ts': '@@ -1,1 +1,1 @@\n-old\n+new' },
      isOnBranch: commit.isOnBranch,
    });
  }

  const fix = await ctx.readRewrittenFix({
    sha: 'aaaaaaa',
    posted: undefined,
    candidates: ['c'.repeat(40), 'd'.repeat(40)],
  });

  expect(fix).toStrictEqual({
    commit: null,
    failure: '2 commits on the branch hold the change of the commit aaaaaaa',
  });
});

test('it finds no branch commit for a sha GitHub holds no commit of', async () => {
  const ctx = await setupTest();

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    sha: 'c'.repeat(40),
    files: ['src/a.ts'],
    patches: { 'src/a.ts': '@@ -1,1 +1,1 @@\n-old\n+new' },
  });

  const fix = await ctx.readRewrittenFix({
    sha: 'bbbbbbb',
    posted: undefined,
    candidates: ['c'.repeat(40)],
  });

  expect(fix).toStrictEqual({ commit: null, failure: 'GitHub holds no commit bbbbbbb' });
});

test('it finds no branch commit for a rewritten commit with a file GitHub gives no patch of', async () => {
  const ctx = await setupTest();

  for (const commit of [
    { sha: 'b'.repeat(40), isOnBranch: false },
    { sha: 'c'.repeat(40), isOnBranch: true },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: ['src/a.ts', 'logo.png'],
      patches: { 'src/a.ts': '@@ -1,1 +1,1 @@\n-old\n+new' },
      isOnBranch: commit.isOnBranch,
    });
  }

  const fix = await ctx.readRewrittenFix({
    sha: 'bbbbbbb',
    posted: undefined,
    candidates: ['c'.repeat(40)],
  });

  expect(fix).toStrictEqual({
    commit: null,
    failure: 'GitHub gives no whole patch of the commit bbbbbbb',
  });
});

test('it finds no branch commit for a rewritten commit that reaches the 3,000 files GitHub lists of a commit', async () => {
  const ctx = await setupTest();

  const files = Array.from({ length: 3000 }, (_, index) => `src/file-${index}.ts`);
  const patches = Object.fromEntries(files.map((path) => [path, '@@ -1,1 +1,1 @@\n-old\n+new']));

  for (const commit of [
    { sha: 'b'.repeat(40), isOnBranch: false },
    { sha: 'c'.repeat(40), isOnBranch: true },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files,
      patches,
      isOnBranch: commit.isOnBranch,
    });
  }

  const fix = await ctx.readRewrittenFix({
    sha: 'bbbbbbb',
    posted: undefined,
    candidates: ['c'.repeat(40)],
  });

  expect(fix).toStrictEqual({
    commit: null,
    failure: 'GitHub gives no whole patch of the commit bbbbbbb',
  });
});

test('it finds no branch commit for a rewritten commit before the head that posted the finding', async () => {
  const ctx = await setupTest();

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false },
    { sha: 'b'.repeat(40), isOnBranch: false },
    { sha: 'c'.repeat(40), isOnBranch: true },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: ['src/a.ts'],
      patches: { 'src/a.ts': `@@ -1,1 +1,1 @@\n-old\n+${commit.sha.slice(0, 1)}` },
      isOnBranch: commit.isOnBranch,
    });
  }

  const fix = await ctx.readRewrittenFix({
    sha: 'aaaaaaa',
    posted: 'b'.repeat(40),
    candidates: ['c'.repeat(40)],
  });

  expect(fix).toStrictEqual({
    commit: null,
    failure: 'the commit aaaaaaa does not come after the review that posted the finding',
  });
});

test('it finds no branch commit when GitHub no longer holds the head that posted the finding', async () => {
  const ctx = await setupTest();

  for (const commit of [
    { sha: 'b'.repeat(40), isOnBranch: false },
    { sha: 'c'.repeat(40), isOnBranch: true },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: ['src/a.ts'],
      patches: { 'src/a.ts': '@@ -1,1 +1,1 @@\n-old\n+new' },
      isOnBranch: commit.isOnBranch,
    });
  }

  githubServer.use(
    http.get(
      `${GITHUB_API_URL}/repos/:owner/:repo/compare/${'a'.repeat(40)}...${'b'.repeat(40)}`,
      () => new HttpResponse(null, { status: 404 }),
    ),
  );

  const fix = await ctx.readRewrittenFix({
    sha: 'bbbbbbb',
    posted: 'a'.repeat(40),
    candidates: ['c'.repeat(40)],
  });

  expect(fix).toStrictEqual({
    commit: null,
    failure: 'the commit bbbbbbb does not come after the review that posted the finding',
  });
});
