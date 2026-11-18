export function parseGitHubTokenEnv(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const keys = ['GH_TOKEN', 'GITHUB_TOKEN'] as const;
  const key = keys.find((name) => (env[name] ?? '') !== '');

  return key === undefined ? null : (env[key] ?? null);
}
