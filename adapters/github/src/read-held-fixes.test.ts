import { expect, test } from 'bun:test';
import { STUB_APP_LOGIN, buildStubAppKey, githubCollections } from '@noslop/testing';
import { createGitHubConnection } from './create-github-connection';
import { readHeldFixes } from './read-held-fixes';
import { readPullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';

async function setupTest() {
  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  return { connection };
}

test('it holds no fix that only a range of a review whose calls failed read', async () => {
  const ctx = await setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  for (const sha of ['b', 'c']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  const finding = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    line: 1,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Await the write","path":"src/a.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${'b'.repeat(40)}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: finding.id,
  });

  const pr = { owner: 'example', repo: 'app', number: 5 };

  const state = await readPullRequestState(ctx.connection, pr);
  const dispositions = await readThreadDispositions(ctx.connection.client, pr, state.threads);

  const held = await readHeldFixes(ctx.connection.client, pr, {
    threads: state.threads,
    dispositions,
    fixCommits: { commits: ['b'.repeat(40), 'c'.repeat(40)], ambiguous: [] },
    marker: {
      head: 'c'.repeat(40),
      base: 'b'.repeat(40),
      notReviewed: [],
      reviews: 2,
      reported: [],
      failedCalls: 1,
      followUps: [],
      confirmed: [],
    },
  });

  expect(held.confirmed).toStrictEqual([]);
});

test('it rejects a fix that a range of a review whose calls failed reports again after an older range confirmed it', async () => {
  const ctx = await setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'e'.repeat(40),
  });

  for (const sha of ['b', 'c', 'd', 'e']) {
    await githubCollections.pullCommits.create({
      owner: 'example',
      repo: 'app',
      number: 5,
      sha: sha.repeat(40),
      files: ['src/a.ts'],
    });
  }

  const finding = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    line: 1,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Await the write","path":"src/a.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${'b'.repeat(40)}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: `fixed ${'c'.repeat(7)}`,
    authorLogin: 'dev',
    inReplyToID: finding.id,
  });

  const pr = { owner: 'example', repo: 'app', number: 5 };

  const state = await readPullRequestState(ctx.connection, pr);
  const dispositions = await readThreadDispositions(ctx.connection.client, pr, state.threads);

  const held = await readHeldFixes(ctx.connection.client, pr, {
    threads: state.threads,
    dispositions,
    fixCommits: {
      commits: ['b'.repeat(40), 'c'.repeat(40), 'd'.repeat(40), 'e'.repeat(40)],
      ambiguous: [],
    },
    marker: {
      head: 'e'.repeat(40),
      base: 'd'.repeat(40),
      notReviewed: [],
      earlier: [
        {
          base: 'c'.repeat(40),
          head: 'd'.repeat(40),
          reported: ['1111111111111111'],
          notReviewed: [],
          partial: true,
        },
        { base: 'b'.repeat(40), head: 'c'.repeat(40), reported: [], notReviewed: [] },
      ],
      reviews: 4,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    },
  });

  expect(held.confirmed).toStrictEqual([]);
});
