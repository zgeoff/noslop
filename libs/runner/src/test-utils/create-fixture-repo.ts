import { mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createTempDir } from '@zgeoff/testing/fs';
import type { TestCommit, TestRepo } from '@zgeoff/testing/git';
import { createGitRepo, readGitEnv } from '@zgeoff/testing/git';

// A git repo in a temp folder that the kit removes after the test. Git runs with the kit's own
// config and a home folder of its own, so no hook or user setting reaches it.
export function createFixtureRepo(commits: readonly TestCommit[]): Promise<TestRepo> {
  const home = createTempDir('git-home');

  return createGitRepo(readGitEnv(home.path), commits);
}

// The same repo at a path the test picks, for a test whose files reach the repo's neighbours, such as
// a symlink that leaves the repo. The test's own folder removes it.
export async function createFixtureRepoAt(
  path: string,
  commits: readonly TestCommit[],
): Promise<TestRepo> {
  const repo = await createFixtureRepo(commits);

  await mkdir(dirname(path), { recursive: true });
  await rename(repo.path, path);

  return { ...repo, path };
}
