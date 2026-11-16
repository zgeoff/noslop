import { expect, test } from 'bun:test';
import { githubCollections } from '@noslop/testing';
import { createGitHubConnection } from './create-github-connection';
import { readGitHubEntry } from './read-github-entry';

function setupTest() {
  return {
    read: async (path: string) => {
      const connection = await createGitHubConnection(null);

      return readGitHubEntry(connection, {
        kind: 'github',
        owner: 'example',
        repo: 'app',
        path,
        ref: 'v2',
      });
    },
  };
}

test('it reads a file as its text', async () => {
  const ctx = setupTest();

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'v2',
    path: 'review.json',
    content: '{ "adapter": "claude" }\n',
  });

  const entry = await ctx.read('review.json');

  expect(entry).toStrictEqual({ kind: 'file', text: '{ "adapter": "claude" }\n' });
});

test('it reads a symlink the contents API answers with the link itself as the link target', async () => {
  const ctx = setupTest();

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'v2',
    path: 'rules/taste.md',
    linkTarget: '../../shared/taste.md',
  });

  const entry = await ctx.read('rules/taste.md');

  expect(entry).toStrictEqual({ kind: 'link', target: '../../shared/taste.md' });
});

test('it reads a folder as a folder', async () => {
  const ctx = setupTest();

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'v2',
    path: 'settings/base.json',
  });

  const entry = await ctx.read('settings');

  expect(entry).toStrictEqual({ kind: 'folder' });
});

test('it reads a path that does not exist as missing', async () => {
  const ctx = setupTest();

  const entry = await ctx.read('patterns.md');

  expect(entry).toStrictEqual({ kind: 'missing' });
});
