import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { loadStore, runStoreQuery } from '@noslop/sqlite';
import {
  buildMockFinding,
  buildMockReviewResult,
  buildStubAppKey,
  githubCollections,
} from '@noslop/testing';
import { createCLIContext } from './create-cli-context';

test('it keeps the store under the home folder when XDG_DATA_HOME is empty', () => {
  const ctx = createCLIContext({ XDG_DATA_HOME: '', XDG_CACHE_HOME: 'relative/cache' });

  expect([ctx.dataDir, ctx.cacheDir]).toStrictEqual([
    join(homedir(), '.local', 'share', 'noslop'),
    join(homedir(), '.cache', 'noslop'),
  ]);
});

test('it puts the store and the cache under the XDG folders the environment sets', () => {
  const ctx = createCLIContext({ XDG_DATA_HOME: '/srv/data', XDG_CACHE_HOME: '/srv/cache' });

  expect([ctx.dataDir, ctx.cacheDir]).toStrictEqual(['/srv/data/noslop', '/srv/cache/noslop']);
});

test('it writes the answers a github review reads to the store of a run that lists sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-context-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const ctx = createCLIContext({
    XDG_DATA_HOME: directory,
    NOSLOP_GITHUB_APP_ID: '1',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: buildStubAppKey(),
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
  });

  const storePath = join(ctx.dataDir, 'store.sqlite');
  const sqlite = ctx.createReporter('sqlite', storePath);
  const github = ctx.createReporter('github', storePath);

  if (sqlite === null || github === null) {
    throw new Error('the CLI context builds no sqlite or github reporter');
  }

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  const first = buildMockReviewResult({
    reviewID: 'review-1',
    pullRequest: { owner: 'example', repo: 'app', number: 5 },
    head: 'b'.repeat(40),
    findings: [buildMockFinding({ id: '1111111111111111' })],
  });

  await sqlite.report(first, { logger: getLogger(['test']), options: {}, failedReporters: [] });
  await github.report(first, { logger: getLogger(['test']), options: {}, failedReporters: [] });

  const [thread] = githubCollections.reviewComments.all();

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'not-a-defect the loop already stops at the end',
    authorLogin: 'dev',
    inReplyToID: thread?.id ?? null,
    createdAt: '2026-03-02T10:00:00.000Z',
  });

  await github.report(
    buildMockReviewResult({
      reviewID: 'review-2',
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      findings: [],
    }),
    { logger: getLogger(['test']), options: {}, failedReporters: [] },
  );

  const store = await loadStore(storePath);

  onTestFinished(() => store.destroy());

  const rows = await runStoreQuery(store, 'findings-by-pr');

  expect(rows).toMatchObject([
    {
      repo: 'example/app',
      pullRequest: 5,
      id: '1111111111111111',
      dispositionKind: 'not-a-defect',
      dispositionValue: 'the loop already stops at the end',
      outcome: 'not-a-defect',
    },
  ]);
});
