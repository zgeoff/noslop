// a path resolved to its file at a case's head: a path with a checkout folder's prefix to the longest
// file it ends with, and a path that leaves out leading folders to the one file that ends with it; a
// path that names no file, or that more than one file ends with, stays as it is
export function resolveFilePath(path: string, files: readonly string[]): string {
  if (files.includes(path)) {
    return path;
  }

  const [longest] = files
    .filter((file) => path.endsWith(`/${file}`))
    .toSorted((left, right) => right.length - left.length);

  if (longest !== undefined) {
    return longest;
  }

  const longer = files.filter((file) => file.endsWith(`/${path}`));

  if (longer.length === 1 && longer[0] !== undefined) {
    return longer[0];
  }

  return path;
}
