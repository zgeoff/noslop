import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import { loadStore, runStoreQuery } from '@noslop/sqlite';
import {
  buildMockFinding,
  buildMockReviewResult,
  buildStubAppKey,
  githubCollections,
  readTempPrefix,
} from '@noslop/testing';
import { createCLIContext } from './create-cli-context';
import { runReporters } from './run-reporters';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-reporters-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const context = createCLIContext({
    XDG_DATA_HOME: directory,
    NOSLOP_GITHUB_APP_ID: '1',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: buildStubAppKey(),
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
  });

  return { context, storePath: join(context.dataDir, 'store.sqlite') };
}

test('it runs the github reporter after sqlite when the list names github first, so the store keeps each comment link', async () => {
  const ctx = await setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    lines: [1],
  });

  const failed = await runReporters(
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 5 },
      head: 'b'.repeat(40),
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
    { ...BUILT_IN_DEFAULTS, report: ['github', 'sqlite'] },
    ctx.context,
  );

  const store = await loadStore(ctx.storePath);

  onTestFinished(() => store.destroy());

  const rows = await runStoreQuery(store, 'findings-by-pr');

  const [thread] = githubCollections.reviewComments.all();

  expect({ failed, links: rows.map((row) => row['commentURL']) }).toStrictEqual({
    failed: [],
    links: [`https://github.com/example/app/pull/5#discussion_r${thread?.id}`],
  });
});
