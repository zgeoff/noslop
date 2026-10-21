import type { NetChangeKey } from './net-change-key';

// the fields of GitHub's entry for a pull request file that the key reads
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

  // false when GitHub listed fewer files than the pull request changes
  isWhole: boolean;
}

// the most characters of patch ids the summary marker keeps, so they, the kept review ranges and the
// summary's table fit under GitHub's comment limit
const KEY_CHARS = 20_000;

// one patch id per changed file, so a rebase or a merge of the base that leaves a file's patch alone
// leaves its id alone; a file with no patch keys on its blob, and a list that is not whole, or one too
// long for the marker, keys on the head
export function buildNetChangeKey(input: NetChangeKeyInput): NetChangeKey {
  if (!input.isWhole) {
    return { head: input.head };
  }

  const entries = input.files
    .map((file) => [file.filename, buildPatchID(file)] as const)
    .toSorted(([first], [second]) => (first < second ? -1 : 1));

  const files = Object.fromEntries(entries);

  return JSON.stringify(files).length > KEY_CHARS ? { head: input.head } : { files };
}

// a hunk header holds line numbers and the heading of the code above the hunk, which a change of the
// base above the hunk moves, so the id reads each header as `@@` alone
function buildPatchID(file: PullRequestFile): string {
  const body =
    file.patch === undefined
      ? `blob ${file.sha ?? 'none'}`
      : file.patch.replaceAll(/^@@ .*$/gmu, '@@');

  return new Bun.CryptoHasher('sha256')
    .update([file.status, file.previous_filename ?? file.filename, body].join('\n'))
    .digest('hex')
    .slice(0, 16);
}
