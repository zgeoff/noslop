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

export function buildCommitFileData(commit: CommitFileSource, filename: string): CommitFileData {
  const previous = commit.renames[filename];
  const patch = commit.patches[filename];
  const renamed = previous === undefined ? {} : { status: 'renamed', previous_filename: previous };

  return { filename, ...renamed, ...(patch === undefined ? {} : { patch }) };
}
