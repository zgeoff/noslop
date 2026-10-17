import { expect, test } from 'bun:test';
import { removeGitHubKeys } from './remove-github-keys';

test('it removes the App keys from the environment and returns a copy that keeps them', () => {
  const env: Record<string, string | undefined> = {
    NOSLOP_GITHUB_APP_ID: '12',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: 'key',
    PATH: '/usr/bin',
  };

  const copy = removeGitHubKeys(env);

  expect(env).toStrictEqual({ PATH: '/usr/bin' });

  expect(copy).toStrictEqual({
    NOSLOP_GITHUB_APP_ID: '12',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: 'key',
    PATH: '/usr/bin',
  });
});
