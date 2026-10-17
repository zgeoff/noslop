import type { Case } from './case';

// the case with each labelled path resolved to its file at the head: a path with a checkout folder's
// prefix to the longest file it ends with, and a path that leaves out leading folders to the one file
// that ends with it; a path that names no file, or that more than one file ends with, stays as it is
export function resolveCasePaths(corpusCase: Case, files: readonly string[]): Case {
  const known = new Set(files);

  return {
    ...corpusCase,
    findings: corpusCase.findings.map((finding) => ({
      ...finding,
      anchor: { ...finding.anchor, path: resolvePath(finding.anchor.path, files, known) },
    })),
    escapes: corpusCase.escapes.map((escape) =>
      escape.anchor === undefined
        ? escape
        : {
            ...escape,
            anchor: { ...escape.anchor, path: resolvePath(escape.anchor.path, files, known) },
          },
    ),
  };
}

function resolvePath(path: string, files: readonly string[], known: Set<string>): string {
  if (known.has(path)) {
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
