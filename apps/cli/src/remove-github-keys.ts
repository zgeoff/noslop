// takes a copy of the environment, then removes the GitHub App's keys from it; the CLI passes the
// process environment, so no model CLI or git process that a review spawns inherits the App's key
export function removeGitHubKeys(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const copy = { ...env };

  for (const key of Object.keys(env).filter((name) => name.startsWith('NOSLOP_GITHUB_'))) {
    delete env[key];
  }

  return copy;
}
