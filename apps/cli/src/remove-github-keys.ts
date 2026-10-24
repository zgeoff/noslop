export function removeGitHubKeys(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const copy = { ...env };

  for (const key of Object.keys(env).filter((name) => name.startsWith('NOSLOP_GITHUB_'))) {
    delete env[key];
  }

  return copy;
}
