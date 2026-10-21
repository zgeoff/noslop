import type { CommitChange } from './make-commit-change-reader';

interface RangeFixChanges {
  fix: CommitChange | null;
  candidates: readonly (CommitChange | null)[];
}

export interface RangeFixInput {
  range: readonly string[];

  // the branch commit that holds the fix, and the sha the answer names
  match: string;
  named: string;
  branchCommits: readonly string[];

  // the patch of the fix and of each range commit off the branch, once read
  changes: RangeFixChanges | null;
}

export type RangeFixPick =
  | { kind: 'found'; commit: string }
  | { kind: 'none' }
  | { kind: 'read'; candidates: string[] };

// a range a rebase left off the branch holds the fix as the one commit off the branch with the
// fix's patch, so a review that read the fix before the rebase still counts it
export function pickRangeFix(input: RangeFixInput): RangeFixPick {
  if (input.range.includes(input.match)) {
    return { kind: 'found', commit: input.match };
  }

  const [named, ...others] = input.range.filter((commit) => commit.startsWith(input.named));

  if (named !== undefined && others.length === 0) {
    return { kind: 'found', commit: named };
  }

  const candidates = input.range.filter((commit) => !input.branchCommits.includes(commit));

  if (candidates.length === 0) {
    return { kind: 'none' };
  }

  if (input.changes === null) {
    return { kind: 'read', candidates };
  }

  return pickPatchMatch(input.changes);
}

// a patch that 2 commits of the range share names neither
function pickPatchMatch(changes: RangeFixChanges): RangeFixPick {
  const fingerprint = changes.fix?.fingerprint ?? null;

  if (fingerprint === null) {
    return { kind: 'none' };
  }

  const [commit, ...others] = changes.candidates.flatMap((change) =>
    change !== null && change.fingerprint === fingerprint ? [change.sha] : [],
  );

  return commit !== undefined && others.length === 0 ? { kind: 'found', commit } : { kind: 'none' };
}
