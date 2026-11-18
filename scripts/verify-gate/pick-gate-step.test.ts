import { expect, test } from 'bun:test';
import { pickGateStep } from './pick-gate-step.ts';

test('it gates a pull request on its base branch and body', () => {
  const event = {
    pull_request: {
      body: 'the report',
      base: { ref: 'main' },
      head: { ref: 'add-orchard-lens' },
      user: { type: 'User', login: 'orchard-keeper' },
    },
  };

  expect(pickGateStep(event)).toStrictEqual({ kind: 'gate', baseRef: 'main', body: 'the report' });
});

test('it gates a pull request with no body on an empty one', () => {
  const event = {
    pull_request: {
      body: null,
      base: { ref: 'main' },
      head: { ref: 'add-orchard-lens' },
      user: { type: 'User', login: 'orchard-keeper' },
    },
  };

  expect(pickGateStep(event)).toStrictEqual({ kind: 'gate', baseRef: 'main', body: '' });
});

test.each([
  {
    bot: 'zgeoff-renovate[bot]',
    ref: 'renovate/left-pad-2.x',
    reason: 'a renovate pull request carries no verify report',
  },
  {
    bot: 'zgeoff-release-bot[bot]',
    ref: 'release-please--branches--main--components--@noslop/cli',
    reason: 'a release pull request carries no verify report',
  },
  {
    bot: 'zgeoff-sync-bot[bot]',
    ref: 'repo-sync/skills',
    reason: 'a repo-sync pull request carries no verify report',
  },
])('it skips the pull request $bot opens from $ref', (row) => {
  const event = {
    pull_request: {
      body: 'bump versions',
      base: { ref: 'main' },
      head: { ref: row.ref },
      user: { type: 'Bot', login: row.bot },
    },
  };

  expect(pickGateStep(event)).toStrictEqual({ kind: 'skip', reason: row.reason });
});

test.each([
  {
    who: 'a person on a renovate branch',
    ref: 'renovate/left-pad-2.x',
    type: 'User',
    login: 'orchard-keeper',
  },
  {
    who: 'a person on the release branch',
    ref: 'release-please--branches--main',
    type: 'User',
    login: 'orchard-keeper',
  },
  {
    who: 'a person on a repo-sync branch',
    ref: 'repo-sync/skills',
    type: 'User',
    login: 'orchard-keeper',
  },
  {
    who: 'a person whose login is the sync bot login',
    ref: 'repo-sync/skills',
    type: 'User',
    login: 'zgeoff-sync-bot[bot]',
  },
  {
    who: 'another bot on a renovate branch',
    ref: 'renovate/left-pad-2.x',
    type: 'Bot',
    login: 'other-bot[bot]',
  },
  {
    who: 'the renovate bot on the sync bot branch',
    ref: 'repo-sync/skills',
    type: 'Bot',
    login: 'zgeoff-renovate[bot]',
  },
])('it gates $who', (row) => {
  const event = {
    pull_request: {
      body: '',
      base: { ref: 'main' },
      head: { ref: row.ref },
      user: { type: row.type, login: row.login },
    },
  };

  expect(pickGateStep(event)).toStrictEqual({ kind: 'gate', baseRef: 'main', body: '' });
});

test('it refuses an event with no pull request', () => {
  expect(pickGateStep({ ref: 'refs/heads/main' })).toMatchObject({ kind: 'refused' });
});
