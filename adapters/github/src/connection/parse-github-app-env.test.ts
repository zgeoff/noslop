import { expect, test } from 'bun:test';
import { parseGitHubAppEnv } from './parse-github-app-env';

test('it reads the installation and restores the line breaks of a one-line key', () => {
  expect(
    parseGitHubAppEnv({
      NOSLOP_GITHUB_APP_ID: '12',
      NOSLOP_GITHUB_APP_PRIVATE_KEY: String.raw`-----BEGIN KEY-----\nabc\n-----END KEY-----`,
      NOSLOP_GITHUB_APP_INSTALLATION_ID: '34',
    }),
  ).toStrictEqual({
    appID: 12,
    privateKey: '-----BEGIN KEY-----\nabc\n-----END KEY-----',
    installationID: 34,
  });
});

test('it returns null when the environment sets no key of the App', () => {
  expect(parseGitHubAppEnv({})).toBeNull();
});

test('it names the missing keys when the environment sets only some', () => {
  expect(() => parseGitHubAppEnv({ NOSLOP_GITHUB_APP_ID: '12' })).toThrowWithMessage(
    Error,
    'the GitHub App needs NOSLOP_GITHUB_APP_PRIVATE_KEY, NOSLOP_GITHUB_APP_INSTALLATION_ID in the environment',
  );
});

test('it rejects an app ID that is not a whole number', () => {
  expect(() =>
    parseGitHubAppEnv({
      NOSLOP_GITHUB_APP_ID: 'abc',
      NOSLOP_GITHUB_APP_PRIVATE_KEY: 'key',
      NOSLOP_GITHUB_APP_INSTALLATION_ID: '34',
    }),
  ).toThrowWithMessage(Error, 'NOSLOP_GITHUB_APP_ID takes a positive whole number, not abc');
});
