import { expect, test } from 'bun:test';
import { buildChildEnv } from './build-child-env';

test('it drops the variables that point git at one repo and keeps the rest', () => {
  expect(
    buildChildEnv({
      PATH: '/usr/bin',
      GIT_DIR: '/repo/.git',
      GIT_WORK_TREE: '/repo',
      GIT_INDEX_FILE: '/repo/.git/index',
      GIT_COMMON_DIR: '/repo/.git',
      GIT_AUTHOR_NAME: 'dev',
    }),
  ).toStrictEqual({ PATH: '/usr/bin', GIT_AUTHOR_NAME: 'dev' });
});

test('it keeps the git config variables that carry settings such as an auth header', () => {
  expect(
    buildChildEnv({
      GIT_DIR: '/repo/.git',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.extraheader',
      GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic abc',
    }),
  ).toStrictEqual({
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraheader',
    GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic abc',
  });
});
