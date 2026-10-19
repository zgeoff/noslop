export interface FixFileEvidenceInput {
  // each path the fix commit changes, and the earlier path of each file it renames
  commitFiles: readonly string[];

  // each path the pull request's diff changes, and the earlier path of each file it renames
  pullRequestFiles: readonly string[];
  findingPath: string;
}

export interface FixFileEvidence {
  // the commit changes a file of the pull request, which a `fixed` answer needs to count
  changesPullRequest: boolean;

  // the commit changes the finding's own file, which the summary shows and no fix needs
  changesFindingFile: boolean;
}

// what a fix commit's files show of a `fixed` answer: the fix may live in any file of the pull
// request, such as a new test beside the finding's file, but a commit outside the pull request's diff
// fixes nothing it holds
export function buildFixFileEvidence(input: FixFileEvidenceInput): FixFileEvidence {
  const pullRequestFiles = new Set(input.pullRequestFiles);

  return {
    changesPullRequest: input.commitFiles.some((path) => pullRequestFiles.has(path)),
    changesFindingFile: input.commitFiles.includes(input.findingPath),
  };
}
