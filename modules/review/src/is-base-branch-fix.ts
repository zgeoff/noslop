export interface BaseBranchFixReads {
  isInBase: boolean;
  isInPostedHead: boolean;
  isInLensHead: boolean;
  authoredAt: number;
  postedCommittedAt: number;
}

// what git shows of a `fixed` commit the pull request's base brought in: whether the commit, its
// parent and the head that posted the finding resolve, and, when all 3 do, the reads of them
export interface BaseBranchFixEvidence {
  isCommitRead: boolean;
  isParentRead: boolean;
  isPostedRead: boolean;
  reads: BaseBranchFixReads | null;
}

export function isBaseBranchFix(evidence: BaseBranchFixEvidence): boolean {
  const reads = evidence.reads;

  if (
    !evidence.isCommitRead ||
    !evidence.isParentRead ||
    !evidence.isPostedRead ||
    reads === null
  ) {
    return false;
  }

  // a rebase gives each commit it moves a new committer date and keeps its author date, so only the
  // author date tells a fix written after the finding from an older commit a restack moved
  const isWrittenAfter = reads.authoredAt >= reads.postedCommittedAt;

  return reads.isInBase && !reads.isInPostedHead && !reads.isInLensHead && isWrittenAfter;
}
