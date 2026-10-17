import { basename } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { ChangedFile } from '@noslop/contract';

const CHANGELOG = /(?:^|\/)CHANGELOG(?:\.[a-z]+)?$/iu;

// a release bump touches only changelogs and the top-level version of package manifests, so each
// manifest, read whole at both commits, differs in its version and in nothing else
export function isReleaseChange(
  files: readonly ChangedFile[],
  baseTexts: ReadonlyMap<string, string>,
  headTexts: ReadonlyMap<string, string>,
): boolean {
  return (
    files.length > 0 &&
    files.every(
      (file) =>
        CHANGELOG.test(file.path) ||
        (basename(file.path) === 'package.json' &&
          file.status === 'modified' &&
          isVersionBump(baseTexts.get(file.path), headTexts.get(file.path))),
    )
  );
}

function isVersionBump(base: string | undefined, head: string | undefined): boolean {
  const before = parseObject(base);
  const after = parseObject(head);

  if (before === null || after === null || before['version'] === after['version']) {
    return false;
  }

  return isDeepStrictEqual({ ...before, version: null }, { ...after, version: null });
}

function parseObject(text: string | undefined): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text ?? '');

    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value))
      : null;
  } catch {
    return null;
  }
}
