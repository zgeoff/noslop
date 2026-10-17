import { expect, test } from 'bun:test';
import { parseAppEvent } from './parse-app-event';

test('it reviews a pull request whose head moved', () => {
  expect(
    parseAppEvent('pull_request', {
      action: 'synchronize',
      installation: { id: 7 },
      repository: { name: 'app', owner: { login: 'example' } },
      sender: { type: 'User' },
      pull_request: { number: 5, draft: false },
    }),
  ).toStrictEqual({ kind: 'review', owner: 'example', repo: 'app', number: 5, installationID: 7 });
});

test('it sets the check again after a reply in a finding thread', () => {
  expect(
    parseAppEvent('pull_request_review_comment', {
      action: 'created',
      installation: { id: 7 },
      repository: { name: 'app', owner: { login: 'example' } },
      sender: { type: 'User' },
      pull_request: { number: 5 },
    }),
  ).toStrictEqual({ kind: 'check', owner: 'example', repo: 'app', number: 5, installationID: 7 });
});

test('it reviews a pull request that a bot opened', () => {
  expect(
    parseAppEvent('pull_request', {
      action: 'opened',
      installation: { id: 7 },
      repository: { name: 'app', owner: { login: 'example' } },
      sender: { type: 'Bot' },
      pull_request: { number: 5, draft: false },
    }),
  ).toStrictEqual({ kind: 'review', owner: 'example', repo: 'app', number: 5, installationID: 7 });
});

test.each([['edited'], ['deleted']])('it sets the check again after a reply is %s', (action) => {
  expect(
    parseAppEvent('pull_request_review_comment', {
      action,
      installation: { id: 7 },
      repository: { name: 'app', owner: { login: 'example' } },
      sender: { type: 'User' },
      pull_request: { number: 5 },
    }),
  ).toStrictEqual({ kind: 'check', owner: 'example', repo: 'app', number: 5, installationID: 7 });
});

test('it sets the check again after a comment on a pull request', () => {
  expect(
    parseAppEvent('issue_comment', {
      action: 'created',
      installation: { id: 7 },
      repository: { name: 'app', owner: { login: 'example' } },
      sender: { type: 'User' },
      issue: { number: 5, pull_request: {} },
    }),
  ).toStrictEqual({ kind: 'check', owner: 'example', repo: 'app', number: 5, installationID: 7 });
});

test.each([
  [
    'a draft pull request',
    'pull_request',
    {
      action: 'opened',
      installation: { id: 7 },
      repository: { name: 'app', owner: { login: 'example' } },
      sender: { type: 'User' },
      pull_request: { number: 5, draft: true },
    },
  ],
  [
    'a comment that the App wrote',
    'issue_comment',
    {
      action: 'created',
      installation: { id: 7 },
      repository: { name: 'app', owner: { login: 'example' } },
      sender: { type: 'Bot' },
      issue: { number: 5, pull_request: {} },
    },
  ],
  [
    'a comment on an issue',
    'issue_comment',
    {
      action: 'created',
      installation: { id: 7 },
      repository: { name: 'app', owner: { login: 'example' } },
      sender: { type: 'User' },
      issue: { number: 5 },
    },
  ],
  [
    'a closed pull request',
    'pull_request',
    {
      action: 'closed',
      installation: { id: 7 },
      repository: { name: 'app', owner: { login: 'example' } },
      sender: { type: 'User' },
      pull_request: { number: 5 },
    },
  ],
  ['another event', 'push', { ref: 'refs/heads/main' }],
])('it leaves %s be', (_, name, payload) => {
  expect(parseAppEvent(name, payload)).toBeNull();
});
