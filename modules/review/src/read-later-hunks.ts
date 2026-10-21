import type { Runner } from '@noslop/runner';

export interface LaterHunksInput {
  runner: Runner;
  repoDir: string;
  from: string;
  to: string;
  path: string;
}

export interface LaterHunk {
  oldStart: number;
  oldLines: number;
  newLines: number;
}

// the hunks with no context lines of the file's change between 2 commits, or null when git cannot
// diff them, such as for a commit the repo lacks; a path is a file's own name, never a glob, and a
// rename reads as a deletion
export async function readLaterHunks(input: LaterHunksInput): Promise<LaterHunk[] | null> {
  const result = await input.runner.run(
    [
      'git',
      '--literal-pathspecs',
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--no-renames',
      '--unified=0',
      input.from,
      input.to,
      '--',
      input.path,
    ],
    { cwd: input.repoDir },
  );

  if (result.exitCode !== 0) {
    return null;
  }

  return [
    ...result.stdout.matchAll(/^@@ -(?<os>\d+)(?:,(?<ol>\d+))? \+\d+(?:,(?<nl>\d+))? @@/gmu),
  ].map((match) => ({
    oldStart: Number(match.groups?.['os']),
    oldLines: Number(match.groups?.['ol'] ?? '1'),
    newLines: Number(match.groups?.['nl'] ?? '1'),
  }));
}
