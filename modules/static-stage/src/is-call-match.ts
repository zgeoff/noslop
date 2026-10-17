// a stack pattern names a call 3 ways: `.handler` matches any callee that ends with it, `Bun.write`
// matches that dotted name on any object chain, and `insertInto` matches the last part of the name
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
