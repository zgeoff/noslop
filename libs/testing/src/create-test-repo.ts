import { mkdir, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildChildEnv } from '@noslop/runner';

export interface TestCommit {
  message: string;

  // each path's content after the commit; null removes the file
  files: Readonly<Record<string, string | null>>;

  // each symlink's target after the commit, as the link stores it
  links?: Readonly<Record<string, string>>;
}

export interface TestRepo {
  path: string;
  commits: string[];
}

// creates a git repo at the path with one commit per entry, in order, and returns each commit's sha;
// git runs without the git repo variables, so a test that runs inside a git hook, which sets GIT_DIR,
// never commits into the hook's repo
export async function createTestRepo(
  path: string,
  commits: readonly TestCommit[],
): Promise<TestRepo> {
  // a shell of its own, since setting the env of Bun.$ changes it for every caller
  const $ = new Bun.$.Shell().env(buildChildEnv(process.env));

  await mkdir(path, { recursive: true });

  await $`git init -q -b main ${path}`.quiet();

  const shas: string[] = [];

  for (const commit of commits) {
    for (const [file, content] of Object.entries(commit.files)) {
      const target = join(path, file);

      if (content === null) {
        await rm(target, { force: true });

        continue;
      }

      await mkdir(dirname(target), { recursive: true });

      await Bun.write(target, content);
    }

    for (const [link, linkTarget] of Object.entries(commit.links ?? {})) {
      const target = join(path, link);

      await rm(target, { force: true, recursive: true });
      await mkdir(dirname(target), { recursive: true });
      await symlink(linkTarget, target);
    }

    await $`git -C ${path} add -A`.quiet();
    await $`git -C ${path} -c user.email=test@example.com -c user.name=test commit -q --allow-empty -m ${commit.message}`.quiet();

    const sha = await $`git -C ${path} rev-parse HEAD`.text();

    shas.push(sha.trim());
  }

  return { path, commits: shas };
}
