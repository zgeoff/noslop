// The paths that no glob matches, which the gate would fail a pull request on.
export function collectUnmappedPaths(paths: readonly string[], globs: readonly string[]): string[] {
  const matchers = globs.map((glob) => new Bun.Glob(glob));

  return paths.filter((path) => !matchers.some((matcher) => matcher.match(path)));
}
