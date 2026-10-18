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

test('it finds no branch commit for a rewritten commit that changed another file than the branch commits', async () => {
  const ctx = await setupTest();

  for (const commit of [
    { sha: 'a'.repeat(40), isOnBranch: false, path: 'src/a.ts' },
    { sha: 'b'.repeat(40), isOnBranch: false, path: 'README.md' },
    { sha: 'c'.repeat(40), isOnBranch: true, path: 'src/a.ts' },
  ]) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: commit.sha,
      files: [commit.path],
      patches: { [commit.path]: '@@ -1,1 +1,1 @@\n-old\n+new' },
      isOnBranch: commit.isOnBranch,
    });
  }

  const fix = await ctx.readRewrittenFix({
    sha: 'bbbbbbb',
    posted: 'a'.repeat(40),
    candidates: ['c'.repeat(40)],
  });

  expect(fix).toStrictEqual({
    commit: null,
    failure: '0 commits on the branch hold the change of the commit bbbbbbb',
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
