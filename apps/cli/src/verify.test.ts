import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '@noslop/config';
import {
  buildMockReviewResult,
  buildStubAppKey,
  githubCollections,
  githubServer,
} from '@noslop/testing';
import { verify } from './verify';

test('it reads the pull request as the App whose keys the environment holds', async () => {
  const seen = mock<(request: string) => void>();

  githubServer.events.on('request:start', (event) => {
    seen(
      `${event.request.method} ${new URL(event.request.url).pathname} ${event.request.headers.get('authorization')}`,
    );
  });

  onTestFinished(() => {
    githubServer.events.removeAllListeners('request:start');
  });

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'main',
    sha: 'a'.repeat(40),
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'a'.repeat(40),
    path: 'review.json',
    content: '{}\n',
  });

  const result = buildMockReviewResult({
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    head: 'b'.repeat(40),
  });

  const env = {
    NOSLOP_GITHUB_APP_ID: '1',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: buildStubAppKey(),
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
  };

  expect(verify(result, { env })).rejects.toThrowWithMessage(
    Error,
    /^the result does not verify: it reviews bbbbbbbbbbbb, but the head of the pull request is cccccccccccc; /u,
  );

  expect(seen).toHaveBeenCalledWith('GET /repos/example/app/pulls/9 token ghs_stand_in');
});

test('it verifies a result when the base config names the App of the keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-verify-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await Bun.write(join(directory, 'review.json'), '{ "github": { "app": "noslop-review" } }\n');

  // the hash a review records when it loads the same config from its checkout
  const loaded = await loadConfig({ repoDir: directory });

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'main',
    sha: 'a'.repeat(40),
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'a'.repeat(40),
    path: 'review.json',
    content: '{ "github": { "app": "noslop-review" } }\n',
  });

  const result = buildMockReviewResult({
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    head: 'b'.repeat(40),
    configHash: loaded.hash,
  });

  const env = {
    NOSLOP_GITHUB_APP_ID: '1',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: buildStubAppKey(),
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
  };

  const verified = await verify(result, { env });

  expect(verified).toStrictEqual(result);
});

test('it refuses a result when the base config names another App than the App of the keys', async () => {
  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'main',
    sha: 'a'.repeat(40),
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'a'.repeat(40),
    path: 'review.json',
    content: '{ "github": { "app": "example-reviewer" } }\n',
  });

  const result = buildMockReviewResult({
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    head: 'b'.repeat(40),
  });

  const env = {
    NOSLOP_GITHUB_APP_ID: '1',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: buildStubAppKey(),
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
  };

  expect(verify(result, { env })).rejects.toThrowWithMessage(
    Error,
    /; the config on main names the App example-reviewer, but the App's keys belong to noslop-review\[bot\]$/u,
  );
});
