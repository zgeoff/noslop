import { generateKeyPairSync } from 'node:crypto';

// a fresh RSA private key in the PEM form GitHub issues for an App, so Octokit signs the App's token
// request for the stand-in GitHub API with a real key
export function buildStubAppKey(): string {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  return keys.privateKey;
}
