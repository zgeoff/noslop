import { collectRangeFiles } from './collect-range-files';

interface CompareCommit {
  sha: string;
  files: string[];
  renames: Record<string, string>;
}

export interface CompareData {
  status: 'ahead' | 'behind' | 'identical';
  merge_base_commit: { sha: string };
  commits: { sha: string }[];
  files: ReturnType<typeof collectRangeFiles>;
}

// GitHub's compare of 2 commits of one line of history, oldest first: the base is an ancestor of the
// head when it comes first, and the merge base is then the base itself; a full sha with no commit is
// the pull request's own base, before every commit, and a shorter one names no commit, so gives null
export function buildCompareData(
  records: readonly CompareCommit[],
  base: string,
  head: string,
): CompareData | null {
  const commits = records.map((commit) => commit.sha);
  const at = commits.findIndex((sha) => sha.startsWith(base));

  if (at === -1 && base.length < 40) {
    return null;
  }

  const found = commits.indexOf(head);
  const end = found === -1 ? commits.length : found + 1;
  const range = records.slice(at + 1, end);
  const status = pickStatus(at + 1, end);

  return {
    status,
    merge_base_commit: { sha: status === 'behind' ? head : (commits[at] ?? base) },
    commits: range.map((commit) => ({ sha: commit.sha })),
    files: collectRangeFiles(range),
  };
}

// the head's place against the first commit after the base
function pickStatus(start: number, end: number): CompareData['status'] {
  if (start === end) {
    return 'identical';
  }

  return start < end ? 'ahead' : 'behind';
}
