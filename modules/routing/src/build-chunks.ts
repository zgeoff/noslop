import type { ChangedFile } from '@noslop/static-stage';

// splits the changed files into chunks of whole files, grouped by the package that owns each one, up
// to the line budget; a file over the budget is a chunk of its own, and a change within the budget
// is one chunk
export function buildChunks(
  files: readonly ChangedFile[],
  packageDirs: readonly string[],
  chunkLines: number,
): ChangedFile[][] {
  const total = files.reduce((sum, file) => sum + file.addedLines + file.deletedLines, 0);

  if (total <= chunkLines) {
    return files.length === 0 ? [] : [[...files]];
  }

  const ordered = files
    .map((file) => ({ file, owner: findOwner(file.path, packageDirs) }))
    .toSorted(
      (left, right) =>
        left.owner.localeCompare(right.owner) || left.file.path.localeCompare(right.file.path),
    );

  const chunks: ChangedFile[][] = [];
  let current: ChangedFile[] = [];
  let currentOwner: string | null = null;
  let currentLines = 0;

  for (const item of ordered) {
    const lines = item.file.addedLines + item.file.deletedLines;
    const isFull = currentLines + lines > chunkLines;
    const isOtherPackage = currentOwner !== null && currentOwner !== item.owner;

    if (current.length > 0 && (isFull || isOtherPackage)) {
      chunks.push(current);

      current = [];
      currentLines = 0;
    }

    current.push(item.file);

    currentOwner = item.owner;
    currentLines += lines;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function findOwner(path: string, packageDirs: readonly string[]): string {
  const owners = packageDirs.filter((dir) => dir === '.' || path.startsWith(`${dir}/`));

  return owners.toSorted((left, right) => right.length - left.length)[0] ?? '.';
}
