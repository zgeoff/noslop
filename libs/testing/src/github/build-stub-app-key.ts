import { generateKeyPairSync } from 'node:crypto';

// Octokit signs the App's token request with this key, so it must be a real RSA key in the PEM
// form GitHub issues.
export function buildStubAppKey(): string {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  return keys.privateKey;
}
