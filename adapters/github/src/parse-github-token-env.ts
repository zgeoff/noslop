// the token a run with no App keys reads GitHub with: GH_TOKEN, then GITHUB_TOKEN; null when neither
// holds a value, so the run reads anonymously
export function parseGitHubTokenEnv(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const keys = ['GH_TOKEN', 'GITHUB_TOKEN'] as const;
  const key = keys.find((name) => (env[name] ?? '') !== '');

  return key === undefined ? null : (env[key] ?? null);
}
