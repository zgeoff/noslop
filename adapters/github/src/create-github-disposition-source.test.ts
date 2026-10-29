import { expect, test } from 'bun:test';
import { getLogger } from '@logtape/logtape';
import { STUB_APP_LOGIN, buildStubAppKey, githubCollections } from '@noslop/testing';
import { createGitHubConnection } from './create-github-connection';
import { createGitHubDispositionSource } from './create-github-disposition-source';

function setupTest() {
  const privateKey = buildStubAppKey();

  const source = createGitHubDispositionSource({
    loadConnection: () => createGitHubConnection({ appID: 1, privateKey, installationID: 7 }),
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
    body: '**P2 · CONFIRMED** Await the write\n<!-- noslop:finding {"id":"1111111111111111","title":"Await the write","path":"src/a.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true} -->',
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
    body: '<!-- noslop:finding {"id":"1111111111111111","title":"Await the write","path":"src/a.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true} -->',
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

test('it records each answer of a reply that answers the findings of a folded comment one line each', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({ owner: 'example', repo: 'app', number: 5 });

  const root = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: '**P2 · Correctness** · Await the write\n<!-- noslop:finding {"id":"1111111111111111","title":"Await the write","path":"src/a.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"folded":[{"id":"2222222222222222","title":"Await the write","path":"src/b.ts","startLine":4,"line":4,"riskClass":null,"writtenByChange":true,"body":"The write runs unawaited.","fix":null},{"id":"3333333333333333","title":"Await the write","path":"src/c.ts","startLine":9,"line":9,"riskClass":null,"writtenByChange":true,"body":"The write runs unawaited.","fix":null}]} -->',
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: 'dev',
    inReplyToID: root.id,
    body: '1111111111111111 fixed 1a2b3c4\n2222222222222222 not-a-defect the caller awaits it\n3333333333333333 fixed 1a2b3c4\n\nThe caller in src/b.ts awaits the returned promise.',
    createdAt: '2026-10-17T10:00:00.000Z',
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
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T10:00:00.000Z',
    },
    {
      findingID: '2222222222222222',
      kind: 'not-a-defect',
      value: 'the caller awaits it',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T10:00:00.000Z',
    },
    {
      findingID: '3333333333333333',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T10:00:00.000Z',
    },
  ]);
});

test('it records a one-answer reply to a folded comment on each finding it holds', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({ owner: 'example', repo: 'app', number: 5 });

  const root = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: '**P2 · Correctness** · Await the write\n<!-- noslop:finding {"id":"1111111111111111","title":"Await the write","path":"src/a.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"folded":[{"id":"2222222222222222","title":"Await the write","path":"src/b.ts","startLine":4,"line":4,"riskClass":null,"writtenByChange":true,"body":"The write runs unawaited.","fix":null}]} -->',
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: 'dev',
    inReplyToID: root.id,
    body: 'fixed 1a2b3c4',
    createdAt: '2026-10-17T10:00:00.000Z',
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
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T10:00:00.000Z',
    },
    {
      findingID: '2222222222222222',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T10:00:00.000Z',
    },
  ]);
});

test('it records each answer of an issue comment that answers the findings of a folded issue comment one line each', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({ owner: 'example', repo: 'app', number: 5 });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: '**P2 · Correctness** · Await the write\n<!-- noslop:finding {"id":"1111111111111111","title":"Await the write","path":"src/a.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"folded":[{"id":"2222222222222222","title":"Await the write","path":"src/b.ts","startLine":4,"line":4,"riskClass":null,"writtenByChange":true,"body":"The write runs unawaited.","fix":null}]} -->',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: 'dev',
    body: '1111111111111111 fixed 1a2b3c4\n2222222222222222 not-a-defect the caller awaits it',
    createdAt: '2026-10-17T10:00:00.000Z',
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
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T10:00:00.000Z',
    },
    {
      findingID: '2222222222222222',
      kind: 'not-a-defect',
      value: 'the caller awaits it',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T10:00:00.000Z',
    },
  ]);
});

test('it records an issue comment that names one id on each finding of the folded issue comment that holds it', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({ owner: 'example', repo: 'app', number: 5 });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: '**P2 · Correctness** · Await the write\n<!-- noslop:finding {"id":"1111111111111111","title":"Await the write","path":"src/a.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"folded":[{"id":"2222222222222222","title":"Await the write","path":"src/b.ts","startLine":4,"line":4,"riskClass":null,"writtenByChange":true,"body":"The write runs unawaited.","fix":null}]} -->',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    authorLogin: 'dev',
    body: '2222222222222222 not-a-defect the caller awaits it',
    createdAt: '2026-10-17T10:00:00.000Z',
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
      kind: 'not-a-defect',
      value: 'the caller awaits it',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T10:00:00.000Z',
    },
    {
      findingID: '2222222222222222',
      kind: 'not-a-defect',
      value: 'the caller awaits it',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T10:00:00.000Z',
    },
  ]);
});
