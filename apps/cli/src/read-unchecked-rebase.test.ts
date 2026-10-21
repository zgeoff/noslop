import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNetChangeKey, createGitHubConnection } from '@noslop/github';
import { createRunner } from '@noslop/runner';
import { buildStubAppKey, createTestRepo, githubCollections } from '@noslop/testing';
import { readUncheckedRebase } from './read-unchecked-rebase';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-unchecked-rebase-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  return { directory, connection, runner: createRunner() };
}

test('it passes a rebase whose moved file a fix merge changes against its first parent', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const separator = "";\n' } },
    { message: 'Describe the app', files: { 'README.md': '# app\n' } },
    {
      message: 'Add the parser',
      parent: 0,
      files: { 'src/parse.ts': 'export const parse = 1;\n' },
    },
    {
      message: 'Merge the base and reject an empty separator',
      parent: 2,
      merged: 1,
      files: { 'src/scan.ts': 'export const separator = ":";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseSha: repo.commits[1] ?? '',
    headSha: repo.commits[3] ?? '',
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    blobSha: '2'.repeat(40),
  });

  const stored = buildNetChangeKey({
    head: repo.commits[2] ?? '',
    isWhole: true,
    files: [{ filename: 'src/scan.ts', status: 'modified', sha: '1'.repeat(40) }],
  });

  const reason = await readUncheckedRebase(ctx.runner, {
    connection: ctx.connection,
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    repoDir: repo.path,
    stored,
    mergeBase: repo.commits[0] ?? '',
    head: repo.commits[3] ?? '',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 1,
        comment: 'An empty separator splits the line into single characters.',
        commit: (repo.commits[3] ?? '').slice(0, 7),
        postedHead: repo.commits[2] ?? '',
      },
    ],
  });

  expect(reason).toBeNull();
});
