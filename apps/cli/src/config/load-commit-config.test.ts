import { expect, test } from 'bun:test';
import { createGitHubConnection } from '@noslop/github';
import { githubCollections } from '@noslop/github/test-utils/github-collections';
import { loadCommitConfig } from './load-commit-config';

function setupTest() {
  return {
    load: (commit: string) =>
      loadCommitConfig(
        () => createGitHubConnection(null),
        { owner: 'example', repo: 'app', number: 9 },
        commit,
      ),
  };
}

test('it names a file read through a link that leaves the repo when another rules file is missing', async () => {
  const ctx = setupTest();
  const commit = 'a'.repeat(40);

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: commit,
    path: 'review.json',
    content: '{ "rules": ["missing.md", "skills/style.md"] }\n',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: commit,
    path: 'skills',
    target: '../outside',
  });

  expect(ctx.load(commit)).rejects.toThrowWithMessage(
    Error,
    /does not exist; the config at a{12} reads files through symlinks that leave the repo, which GitHub cannot serve: skills\/style\.md \(under skills, a link to \.\.\/outside\)$/u,
  );
});

test("it names a parent config's rules file read through a link that leaves the parent's repo", async () => {
  const ctx = setupTest();
  const commit = 'a'.repeat(40);

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: commit,
    path: 'review.json',
    content: '{ "extends": "github:example/noslop-config/review.json@v2" }\n',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'noslop-config',
    ref: 'v2',
    path: 'review.json',
    content: '{ "rules": ["skills/style.md"] }\n',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'noslop-config',
    ref: 'v2',
    path: 'skills',
    target: '/opt/skills',
  });

  expect(ctx.load(commit)).rejects.toThrowWithMessage(
    Error,
    `the config at aaaaaaaaaaaa reads files through symlinks that leave the repo, which GitHub cannot serve: github:example/noslop-config/skills/style.md (under skills, a link to /opt/skills)`,
  );
});
