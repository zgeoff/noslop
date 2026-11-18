import { expect, test } from 'bun:test';
import { createPrivateKey } from 'node:crypto';
import { buildStubAppKey } from './build-stub-app-key';

test('it builds an RSA private key in the PEM form of a GitHub App key', () => {
  const key = buildStubAppKey();

  expect(key).toStartWith('-----BEGIN RSA PRIVATE KEY-----');
  expect(createPrivateKey(key).asymmetricKeyType).toBe('rsa');
});

test('it builds a different key on each call', () => {
  expect(buildStubAppKey()).not.toBe(buildStubAppKey());
});
