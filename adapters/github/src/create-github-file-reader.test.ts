import { expect, test } from 'bun:test';
import { githubCollections } from '@noslop/testing';
import { createGitHubConnection } from './create-github-connection';
import { createGitHubFileReader } from './create-github-file-reader';

function setupTest() {
  return {
    read: createGitHubFileReader({ loadConnection: () => createGitHubConnection(null) }),
  };
}

test('it reads a config file from a repo at its ref', async () => {
  const ctx = setupTest();

  await githubCollections.files.create({
    owner: 'example',
    repo: 'noslop-config',
    ref: 'v2',
    path: 'review.json',
    content: '{ "adapter": "claude" }\n',
  });

  const text = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'noslop-config',
    path: 'review.json',
    ref: 'v2',
  });

  expect(text).toBe('{ "adapter": "claude" }\n');
});

test('it reads a file that does not exist as null', async () => {
  const ctx = setupTest();

  const text = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'noslop-config',
    path: 'patterns.md',
    ref: null,
  });

  expect(text).toBeNull();
});
