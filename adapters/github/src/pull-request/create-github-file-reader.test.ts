import { expect, test } from 'bun:test';
import { createGitHubConnection } from '../connection/create-github-connection';
import { githubCollections } from '../test-utils/github-collections';
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

  const read = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'noslop-config',
    path: 'review.json',
    ref: 'v2',
  });

  expect(read).toStrictEqual({ kind: 'file', text: '{ "adapter": "claude" }\n' });
});

test('it reads a file that does not exist as missing', async () => {
  const ctx = setupTest();

  const read = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'noslop-config',
    path: 'patterns.md',
    ref: null,
  });

  expect(read).toStrictEqual({ kind: 'missing' });
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

  const read = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'app',
    path: '.claude/skills/style/SKILL.md',
    ref: 'main',
  });

  expect(read).toStrictEqual({ kind: 'file', text: 'Name each total for what it sums.\n' });
});

test('it reads a file through a symlinked folder whose target runs through another', async () => {
  const ctx = setupTest();

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'vendor/skills/style/SKILL.md',
    content: 'Name each total for what it sums.\n',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'shared',
    target: 'vendor',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'skills',
    target: 'shared/skills',
  });

  const read = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'app',
    path: 'skills/style/SKILL.md',
    ref: 'main',
  });

  expect(read).toStrictEqual({ kind: 'file', text: 'Name each total for what it sums.\n' });
});

test('it reads a folder as missing', async () => {
  const ctx = setupTest();

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'skills/style/SKILL.md',
    content: 'Name each total for what it sums.\n',
  });

  const read = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'app',
    path: 'skills/style',
    ref: 'main',
  });

  expect(read).toStrictEqual({ kind: 'missing' });
});

test('it reads a file that a folder of the repo does not hold as missing', async () => {
  const ctx = setupTest();

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'skills/style/SKILL.md',
    content: 'Name each total for what it sums.\n',
  });

  const read = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'app',
    path: 'skills/tests/SKILL.md',
    ref: 'main',
  });

  expect(read).toStrictEqual({ kind: 'missing' });
});

test.each([
  {
    case: 'a symlinked folder whose target leaves the repo',
    links: { skills: '../../outside' },
    path: 'skills/style/SKILL.md',
    link: 'skills',
    target: '../../outside',
  },
  {
    case: 'a symlinked folder whose target is an absolute path',
    links: { skills: '/etc' },
    path: 'skills/style/SKILL.md',
    link: 'skills',
    target: '/etc',
  },
  {
    case: 'a symlink whose target leaves the repo',
    links: { 'review.json': '../shared/review.json' },
    path: 'review.json',
    link: 'review.json',
    target: '../shared/review.json',
  },
  {
    case: 'a symlinked folder whose target runs through a link that leaves the repo',
    links: { skills: 'shared/skills', shared: '../vendor' },
    path: 'skills/style/SKILL.md',
    link: 'shared',
    target: '../vendor',
  },
])('it reads a file through $case as the link that leaves', async (row) => {
  const ctx = setupTest();

  for (const [path, target] of Object.entries(row.links)) {
    await githubCollections.files.create({
      owner: 'example',
      repo: 'app',
      ref: 'main',
      path,
      target,
    });
  }

  const read = await ctx.read({
    kind: 'github',
    owner: 'example',
    repo: 'app',
    path: row.path,
    ref: 'main',
  });

  expect(read).toStrictEqual({ kind: 'outside', link: row.link, target: row.target });
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
