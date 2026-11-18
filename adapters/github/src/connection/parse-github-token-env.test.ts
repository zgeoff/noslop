import { expect, test } from 'bun:test';
import { parseGitHubTokenEnv } from './parse-github-token-env';

test('it reads GH_TOKEN before GITHUB_TOKEN', () => {
  expect(parseGitHubTokenEnv({ GH_TOKEN: 'ghp_first', GITHUB_TOKEN: 'ghp_second' })).toBe(
    'ghp_first',
  );
});

test('it reads GITHUB_TOKEN when GH_TOKEN is empty', () => {
  expect(parseGitHubTokenEnv({ GH_TOKEN: '', GITHUB_TOKEN: 'ghp_second' })).toBe('ghp_second');
});

test('it reads no token from an environment that holds neither', () => {
  expect(parseGitHubTokenEnv({ HOME: '/srv/home' })).toBeNull();
});
