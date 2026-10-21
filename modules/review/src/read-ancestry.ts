import type { Runner } from '@noslop/runner';

export interface AncestryInput {
  runner: Runner;
  repoDir: string;
}

// reads from git whether the descendant holds the commit
export async function readAncestry(
  input: AncestryInput,
  commit: string,
  descendant: string,
): Promise<boolean> {
  const result = await input.runner.run(
    ['git', 'merge-base', '--is-ancestor', commit, descendant],
    { cwd: input.repoDir },
  );

  return result.exitCode === 0;
}
