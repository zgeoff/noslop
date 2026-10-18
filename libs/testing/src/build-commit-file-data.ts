interface CommitFileSource {
  renames: Record<string, string>;
  patches: Record<string, string>;
}

interface CommitFileData {
  filename: string;
  status?: string;
  previous_filename?: string;
  patch?: string;
}

// one changed file of a commit as GitHub lists it: a rename names the path it had before, and the
// patch appears only when the commit holds one for the file
export function buildCommitFileData(commit: CommitFileSource, filename: string): CommitFileData {
  const previous = commit.renames[filename];
  const patch = commit.patches[filename];
  const renamed = previous === undefined ? {} : { status: 'renamed', previous_filename: previous };

  return { filename, ...renamed, ...(patch === undefined ? {} : { patch }) };
}
