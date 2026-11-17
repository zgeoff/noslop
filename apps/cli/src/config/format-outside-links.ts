import type { OutsideLink } from './load-commit-config';

export function formatOutsideLinks(links: readonly OutsideLink[]): string {
  const names = links.map((found) =>
    found.path === found.link
      ? `${found.path} (a link to ${found.target})`
      : `${found.path} (under ${found.link}, a link to ${found.target})`,
  );

  return `reads files through symlinks that leave the repo, which GitHub cannot serve: ${names.toSorted().join(', ')}`;
}
