import { expect, test } from 'bun:test';
import { createStubReplyDuringWrite } from './create-stub-reply-during-write';
import { githubCollections } from './github-collections';
import { GITHUB_API_URL } from './github-handlers';
import { githubServer } from './github-server';

test('it adds the reply on the first edit of an issue comment and still applies the edit', async () => {
  const comment = await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'before',
  });

  githubServer.use(
    createStubReplyDuringWrite({
      owner: 'example',
      repo: 'app',
      number: 5,
      body: 'fixed abc1234',
      authorLogin: 'dev',
      inReplyToID: 41,
    }),
  );

  const response = await fetch(
    `${GITHUB_API_URL}/repos/example/app/issues/comments/${comment.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ body: 'after' }),
    },
  );

  expect(response.status).toBe(200);
  expect(githubCollections.issueComments.all().map((item) => item.body)).toStrictEqual(['after']);

  expect(
    githubCollections.reviewComments.all().map((item) => [item.body, item.inReplyToID]),
  ).toStrictEqual([['fixed abc1234', 41]]);
});

test('it adds the reply once however many edits follow', async () => {
  const comment = await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    body: 'before',
  });

  githubServer.use(
    createStubReplyDuringWrite({
      owner: 'example',
      repo: 'app',
      number: 5,
      body: 'fixed abc1234',
      authorLogin: 'dev',
      inReplyToID: 41,
    }),
  );

  for (const body of ['first', 'second']) {
    await fetch(`${GITHUB_API_URL}/repos/example/app/issues/comments/${comment.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
  }

  expect(githubCollections.reviewComments.all()).toHaveLength(1);
});
