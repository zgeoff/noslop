export function collectKeySources(
  sources: Readonly<Record<string, string>>,
  key: string,
  chain: readonly string[],
): string[] {
  const keySources = new Set(
    Object.entries(sources).flatMap(([path, source]) =>
      path === key || path.startsWith(`${key}.`) ? [source] : [],
    ),
  );

  return keySources.size === 0 ? ['built-in'] : chain.filter((source) => keySources.has(source));
}
