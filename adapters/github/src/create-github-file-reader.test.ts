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

test('it reads a file under a symlinked folder from the folder the link names', async () => {
  const ctx = setupTest();

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: '.agents/skills/style/SKILL.md',
    content: 'Name each total for what it sums.\n',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: '.claude/skills',
    target: '../.agents/skills',
  });

  const text = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'app',
    path: '.claude/skills/style/SKILL.md',
    ref: 'main',
  });

  expect(text).toBe('Name each total for what it sums.\n');
});

test('it reads a symlinked file from the file the link names', async () => {
  const ctx = setupTest();

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'config/review.json',
    content: '{ "adapter": "codex" }\n',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'review.json',
    target: 'config/review.json',
  });

  const text = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'app',
    path: 'review.json',
    ref: 'main',
  });

  expect(text).toBe('{ "adapter": "codex" }\n');
});

test('it reads a file that a folder of the repo does not hold as null', async () => {
  const ctx = setupTest();

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'skills/style/SKILL.md',
    content: 'Name each total for what it sums.\n',
  });

  const text = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'app',
    path: 'skills/tests/SKILL.md',
    ref: 'main',
  });

  expect(text).toBeNull();
});

test.each([
  { case: 'leaves the repo', target: '../../outside' },
  { case: 'is an absolute path', target: '/etc' },
])('it reads a file under a symlinked folder whose target $case as null', async (row) => {
  const ctx = setupTest();

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'skills',
    target: row.target,
  });

  const text = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'app',
    path: 'skills/style/SKILL.md',
    ref: 'main',
  });

  expect(text).toBeNull();
});

test('it throws on a symlink cycle', async () => {
  const ctx = setupTest();

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'one',
    target: 'two',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'two',
    target: 'one',
  });

  expect(
    ctx.read({
      kind: 'github',
      owner: 'example',
      repo: 'app',
      path: 'one/review.json',
      ref: 'main',
    }),
  ).rejects.toThrowWithMessage(Error, /follows too many symlinks/u);
});
