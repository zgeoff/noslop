import { formatMarker } from './format-marker';
import type { NetChangeKey } from './net-change-key';

export interface PullRequestFile {
  filename: string;
  status: string;
  previous_filename?: string;
  patch?: string;
  sha: string | null;
}

export interface NetChangeKeyInput {
  head: string;
  files: readonly PullRequestFile[];

  isWhole: boolean;
}

// GitHub refuses a comment past its length limit, and the summary comment holds these ids beside its
// table, so the cap counts the ids as the marker writes them, escapes included.
const KEY_CHARS = 20_000;

export function buildNetChangeKey(input: NetChangeKeyInput): NetChangeKey {
  if (!input.isWhole) {
    return { head: input.head };
  }

  const entries = input.files
    .map((file) => [file.filename, buildPatchID(file)] as const)
    .toSorted(([first], [second]) => (first < second ? -1 : 1));

  const files = Object.fromEntries(entries);

  return formatMarker('summary', files).length > KEY_CHARS ? { head: input.head } : { files };
}

// a change of the base above a hunk moves the line numbers of its header, so the id leaves them out;
// the heading after them names the code the hunk sits in, so it tells apart 2 like edits in 2 places
function buildPatchID(file: PullRequestFile): string {
  const body =
    file.patch === undefined
      ? `blob ${file.sha ?? 'none'}`
      : file.patch.replaceAll(/^@@ [^@]* @@/gmu, '@@');

  return new Bun.CryptoHasher('sha256')
    .update([file.status, file.previous_filename ?? file.filename, body].join('\n'))
    .digest('hex')
    .slice(0, 16);
}
