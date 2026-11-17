export interface GitHubAppCredentials {
  appID: number;
  privateKey: string;
  installationID: number;
}

const KEYS = [
  'NOSLOP_GITHUB_APP_ID',
  'NOSLOP_GITHUB_APP_PRIVATE_KEY',
  'NOSLOP_GITHUB_APP_INSTALLATION_ID',
] as const;

export function parseGitHubAppEnv(
  env: Readonly<Record<string, string | undefined>>,
): GitHubAppCredentials | null {
  const values = KEYS.map((key) => env[key] ?? '');
  const missing = KEYS.filter((_, index) => values[index] === '');

  if (missing.length === KEYS.length) {
    return null;
  }

  if (missing.length > 0) {
    throw new Error(`the GitHub App needs ${missing.join(', ')} in the environment`);
  }

  const [appID, privateKey, installationID] = values;

  return {
    appID: parseID(KEYS[0], appID ?? ''),

    // A private key written on one line in an environment variable holds its line breaks as `\n`.
    privateKey: (privateKey ?? '').replaceAll(String.raw`\n`, '\n'),
    installationID: parseID(KEYS[2], installationID ?? ''),
  };
}

function parseID(key: string, value: string): number {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${key} takes a positive whole number, not ${value}`);
  }

  return id;
}
