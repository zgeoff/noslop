import { expect, test } from 'bun:test';
import { parseAppServerEnv } from './parse-app-server-env';

test('it reads the App settings and restores the newlines of the key', () => {
  expect(
    parseAppServerEnv({
      NOSLOP_GITHUB_APP_ID: '12',
      NOSLOP_GITHUB_APP_PRIVATE_KEY: 'line one\\nline two',
      NOSLOP_GITHUB_WEBHOOK_SECRET: 'secret',
      NOSLOP_GITHUB_APP_REPOS_DIR: '/srv/repos',
      PORT: '8080',
    }),
  ).toStrictEqual({
    appID: 12,
    privateKey: 'line one\nline two',
    webhookSecret: 'secret',
    port: 8080,
    reposDir: '/srv/repos',
  });
});

test('it listens on port 3000 when no port is set', () => {
  expect(
    parseAppServerEnv({
      NOSLOP_GITHUB_APP_ID: '12',
      NOSLOP_GITHUB_APP_PRIVATE_KEY: 'key',
      NOSLOP_GITHUB_WEBHOOK_SECRET: 'secret',
      NOSLOP_GITHUB_APP_REPOS_DIR: '/srv/repos',
    }).port,
  ).toBe(3000);
});

test('it names each missing setting', () => {
  expect(() =>
    parseAppServerEnv({ NOSLOP_GITHUB_APP_ID: '12', NOSLOP_GITHUB_APP_REPOS_DIR: '/srv/repos' }),
  ).toThrowWithMessage(
    Error,
    'the noslop App needs these settings: NOSLOP_GITHUB_APP_PRIVATE_KEY, NOSLOP_GITHUB_WEBHOOK_SECRET',
  );
});
