import { expect, test } from 'bun:test';
import { getLogger } from '@logtape/logtape';
import { STUB_APP_LOGIN, buildStubAppKey, githubCollections } from '@noslop/testing';
import { createGitHubClient } from './create-github-client';
import { createGitHubDispositionSource } from './create-github-disposition-source';

function setupTest() {
  const privateKey = buildStubAppKey();

  const source = createGitHubDispositionSource({
    loadClient: () => createGitHubClient({ appID: 1, privateKey, installationID: 7 }),
  });

  return { source, logger: getLogger(['test']) };
}

test('it reads the typed replies of each finding thread and whether their author owns the repo', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({ owner: 'example', repo: 'app', number: 5 });

  await githubCollections.collaborators.create({
    owner: 'example',
    repo: 'app',
    login: 'lead',
    permission: 'admin',
  });

  const root = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: '**P2 · CONFIRMED** Await the write\n<!-- noslop:finding {"id":"1111111111111111","title":"Await the write","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true} -->',
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: 'dev',
    inReplyToID: root.id,
    body: 'Looking at it.',
    createdAt: '2026-10-17T10:00:00.000Z',
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: 'lead',
    inReplyToID: root.id,
    body: 'accepted-risk one tenant per deploy',
    createdAt: '2026-10-17T11:00:00.000Z',
  });

  const dispositions = await ctx.source.readDispositions(
    {
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [],
    },
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  expect(dispositions).toStrictEqual([
    {
      findingID: '1111111111111111',
      kind: 'accepted-risk',
      value: 'one tenant per deploy',
      author: 'lead',
      authorIsOwner: true,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
  ]);
});

test('it ignores a marker that a person pasted into their own comment', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({ owner: 'example', repo: 'app', number: 5 });

  const root = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: 'dev',
    body: '<!-- noslop:finding {"id":"1111111111111111","title":"Await the write","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true} -->',
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: 'dev',
    inReplyToID: root.id,
    body: 'not-a-defect it is fine',
  });

  const dispositions = await ctx.source.readDispositions(
    {
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [],
    },
    { logger: ctx.logger, options: {}, failedReporters: [] },
  );

  expect(dispositions).toStrictEqual([]);
});
