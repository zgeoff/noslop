import type { OutsideFile } from './load-commit-config';

export function formatOutsideFiles(files: readonly OutsideFile[]): string {
  const names = files.map((file) =>
    file.linkTarget === null ? file.path : `${file.path} (a link to ${file.linkTarget})`,
  );

  return [...new Set(names)].toSorted().join(', ');
}
