import { expect, test } from 'bun:test';
import { buildStubAppKey, githubCollections } from '@noslop/testing';
import { createGitHubConnection } from './create-github-connection';
import { readLinkedIssue } from './read-linked-issue';

function setupTest() {
  const privateKey = buildStubAppKey();

  return {
    loadConnection: () => createGitHubConnection({ appID: 1, privateKey, installationID: 7 }),
  };
}

test('it reads the issue that the body closes, as its number, title and body', async () => {
  const ctx = setupTest();

  await githubCollections.issues.create({
    owner: 'example',
    repo: 'app',
    number: 12,
    title: 'Restock fails on a new SKU',
    body: 'A delivery for a SKU with no row throws.',
  });

  const connection = await ctx.loadConnection();

  const issue = await readLinkedIssue(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    'Adds the row first.\n\nFixes #12',
  );

  expect(issue).toBe('#12 Restock fails on a new SKU\n\nA delivery for a SKU with no row throws.');
});

test('it reads no issue from a body with no closing keyword', async () => {
  const ctx = setupTest();

  const connection = await ctx.loadConnection();

  const issue = await readLinkedIssue(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    'Relates to #12',
  );

  expect(issue).toBeNull();
});

test('it reads no issue when the linked issue does not exist', async () => {
  const ctx = setupTest();

  const connection = await ctx.loadConnection();

  const issue = await readLinkedIssue(
    connection,
    { owner: 'example', repo: 'app', number: 5 },
    'Closes #404',
  );

  expect(issue).toBeNull();
});
