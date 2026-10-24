import { P, match } from 'ts-pattern';
import { collectChangedFiles } from './collect-changed-files';
import type { NetChangeKey } from './net-change-key';

export interface ReviewedKey {
  head: string;
  key?: NetChangeKey | undefined;
}

export function findChangedPaths(
  reviewed: ReviewedKey,
  currentHead: string,
  currentKey: NetChangeKey,
): string[] | null {
  const stored = reviewed.key ?? { head: reviewed.head };

  return match([stored, currentKey])
    .with([{ files: P.select('before') }, { files: P.select('after') }], (keys) =>
      collectChangedFiles(keys.before, keys.after),
    )
    .with([{ head: P.string }, P._], [P._, { head: P.string }], () =>
      reviewed.head === currentHead ? [] : null,
    )
    .exhaustive();
}
