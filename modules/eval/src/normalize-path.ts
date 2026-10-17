// a path relative to the repo root, with a leading ./ dropped, so `./src/a.ts` and `src/a.ts` are one
export function normalizePath(path: string): string {
  return path.replace(/^\.\//u, '');
}
