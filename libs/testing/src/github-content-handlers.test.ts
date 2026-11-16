import { expect, test } from 'bun:test';
import { githubCollections } from './github-collections';
import { GITHUB_API_URL } from './github-handlers';

test('it serves a file at its ref as base64 content', async () => {
  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'v2',
    path: 'review.json',
    content: '{}\n',
  });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/contents/review.json?ref=v2`);
  const entry: unknown = await response.json();

  expect(entry).toStrictEqual({
    type: 'file',
    encoding: 'base64',
    path: 'review.json',
    content: 'e30K',
  });
});

test('it serves a symlink as its target', async () => {
  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: '.claude/skills',
    target: '../.agents/skills',
  });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/contents/.claude/skills`);
  const entry: unknown = await response.json();

  expect(entry).toStrictEqual({
    type: 'symlink',
    path: '.claude/skills',
    target: '../.agents/skills',
  });
});

test('it lists the entries of a folder', async () => {
  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: '.agents/skills/style/SKILL.md',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: '.agents/README.md',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: '.agents/latest',
    target: 'skills',
  });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/contents/.agents`);
  const entries: unknown = await response.json();

  expect(entries).toStrictEqual([
    { type: 'dir', name: 'skills', path: '.agents/skills' },
    { type: 'file', name: 'README.md', path: '.agents/README.md' },
    { type: 'symlink', name: 'latest', path: '.agents/latest' },
  ]);
});

test('it answers 404 for a path under a symlinked folder', async () => {
  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: '.agents/skills/style/SKILL.md',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: '.claude/skills',
    target: '../.agents/skills',
  });

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/contents/.claude/skills/style/SKILL.md`,
  );

  expect(response.status).toBe(404);
});
