import { expect, test } from 'bun:test';
import { parseSandboxEnv } from './parse-sandbox-env.ts';

test('it reads the sandbox repo and prefers GH_TOKEN to GITHUB_TOKEN', () => {
  const env = {
    NOSLOP_VERIFY_REPO: 'orchard-co/review-sandbox',
    GH_TOKEN: 'token-from-gh',
    GITHUB_TOKEN: 'token-from-actions',
  };

  expect(parseSandboxEnv(env)).toStrictEqual({
    owner: 'orchard-co',
    repo: 'review-sandbox',
    token: 'token-from-gh',
  });
});

test.each([
  { name: 'no repo', repo: undefined },
  { name: 'a repo with no owner', repo: 'review-sandbox' },
  { name: 'a repo URL', repo: 'https://github.com/orchard-co/review-sandbox' },
])('it refuses $name with an environment error that names the variable', (row) => {
  const env = { NOSLOP_VERIFY_REPO: row.repo, GH_TOKEN: 'token-from-gh' };

  expect(() => parseSandboxEnv(env)).toThrow(
    expect.objectContaining({
      code: 'environment',
      message: expect.stringContaining('NOSLOP_VERIFY_REPO'),
    }),
  );
});

test('it refuses an environment with no token', () => {
  const env = { NOSLOP_VERIFY_REPO: 'orchard-co/review-sandbox' };

  expect(() => parseSandboxEnv(env)).toThrow(
    expect.objectContaining({ code: 'environment', message: expect.stringContaining('GH_TOKEN') }),
  );
});
