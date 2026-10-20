export interface ListedCommit {
  sha: string;
  parents: number;
}

export interface RebasedHeadChoice {
  // the head of the earlier review, which the branch no longer holds
  reviewedHead: string;

  // the reviewed commits past the base, and the branch commits past it, oldest first
  reviewed: readonly ListedCommit[];
  branch: readonly ListedCommit[];

  // each commit's patch id by its sha; a commit with no patch has none
  patchIDs: ReadonlyMap<string, string>;
}

export interface RebasedHead {
  // the branch commit that stands for the reviewed head
  head: string | null;

  // why no branch commit stands for it, which the refusal gives
  failure: string | null;
}

// the branch commit that stands for a reviewed head: the reviewed commits must open the branch in
// order, each with the same patch id; a merge, an empty commit or a changed patch picks none
export function pickRebasedHead(choice: RebasedHeadChoice): RebasedHead {
  const reviewed = choice.reviewed;

  if (reviewed.length === 0) {
    return toFailure(
      `the reviewed head ${toShort(choice.reviewedHead)} holds no commit past the base`,
    );
  }

  const paired = choice.branch.slice(0, reviewed.length);
  const merge = [...reviewed, ...paired].find((commit) => commit.parents > 1);

  if (merge !== undefined) {
    return toFailure(`the merge ${toShort(merge.sha)} takes a full review`);
  }

  if (paired.length < reviewed.length) {
    return toFailure(
      `the branch holds ${paired.length} of the ${reviewed.length} reviewed commits past the base`,
    );
  }

  const empty = reviewed.find((commit) => !choice.patchIDs.has(commit.sha));

  if (empty !== undefined) {
    return toFailure(`the reviewed commit ${toShort(empty.sha)} has no patch to match`);
  }

  const changed = reviewed.find(
    (commit, index) =>
      choice.patchIDs.get(commit.sha) !== choice.patchIDs.get(paired[index]?.sha ?? ''),
  );

  if (changed !== undefined) {
    return toFailure(`the rebase changed the patch of the reviewed commit ${toShort(changed.sha)}`);
  }

  return { head: paired.at(-1)?.sha ?? null, failure: null };
}

function toFailure(failure: string): RebasedHead {
  return { head: null, failure };
}

function toShort(sha: string): string {
  return sha.slice(0, 12);
}
