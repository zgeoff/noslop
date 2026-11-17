import { expect, test } from 'bun:test';
import { STUB_APP_LOGIN, buildStubAppKey } from '@noslop/testing';
import { buildTrustedConnection } from './build-trusted-connection';
import { createGitHubConnection } from './create-github-connection';

test('it trusts the comments of the App the slug names on a token connection', async () => {
  const connection = await createGitHubConnection(null, 'ghp_reader');

  const trusted = buildTrustedConnection(connection, 'example-reviewer');

  expect(trusted.appLogin).toBe('example-reviewer[bot]');
});

test('it trusts the comments of the App the slug names on an anonymous connection', async () => {
  const connection = await createGitHubConnection(null);

  const trusted = buildTrustedConnection(connection, 'example-reviewer');

  expect(trusted.appLogin).toBe('example-reviewer[bot]');
});

test('it trusts no comment on a token connection when the config names no App', async () => {
  const connection = await createGitHubConnection(null, 'ghp_reader');

  const trusted = buildTrustedConnection(connection, null);

  expect(trusted.appLogin).toBeNull();
});

test("it keeps the App's own login when the slug names the App of the keys", async () => {
  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  const trusted = buildTrustedConnection(connection, STUB_APP_LOGIN.replace('[bot]', ''));

  expect(trusted.appLogin).toBe(STUB_APP_LOGIN);
});

test('it refuses a slug that names another App than the App of the keys', async () => {
  const connection = await createGitHubConnection({
    appID: 1,
    privateKey: buildStubAppKey(),
    installationID: 7,
  });

  expect(() => buildTrustedConnection(connection, 'example-reviewer')).toThrowWithMessage(
    Error,
    `github.app names the App example-reviewer, but the App's keys belong to ${STUB_APP_LOGIN}; set github.app to the slug of the App that posts the reviews`,
  );
});
