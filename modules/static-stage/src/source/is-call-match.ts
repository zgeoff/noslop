export function isCallMatch(callee: string, patterns: readonly string[]): boolean {
  const last = callee.slice(callee.lastIndexOf('.') + 1);

  return patterns.some((pattern) => {
    if (pattern.startsWith('.')) {
      return callee.endsWith(pattern);
    }

    if (pattern.includes('.')) {
      return callee === pattern || callee.endsWith(`.${pattern}`);
    }

    return last === pattern;
  });
}
