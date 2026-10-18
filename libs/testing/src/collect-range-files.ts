// the files a range of commits changes, as GitHub's compare lists them: each path once, and a file
// renamed over the range names the path it had at the range's base
export function collectRangeFiles(
  range: readonly { files: string[]; renames: Record<string, string> }[],
): { filename: string; status?: string; previous_filename?: string }[] {
  const origins = new Map<string, string>();
  const paths = new Set<string>();

  for (const commit of range) {
    for (const path of commit.files) {
      const previous = commit.renames[path];

      if (previous !== undefined) {
        origins.set(path, origins.get(previous) ?? previous);
        origins.delete(previous);
        paths.delete(previous);
      }

      paths.add(path);
    }
  }

  return [...paths].map((filename) => {
    const origin = origins.get(filename);

    return origin === undefined
      ? { filename }
      : { filename, status: 'renamed', previous_filename: origin };
  });
}
