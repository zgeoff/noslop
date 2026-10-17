import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface TestCommit {
  message: string;

  // each path's content after the commit; null removes the file
  files: Readonly<Record<string, string | null>>;
}

export interface TestRepo {
  path: string;
  commits: string[];
}

// creates a git repo at the path with one commit per entry, in order, and returns each commit's sha
export async function createTestRepo(
  path: string,
  commits: readonly TestCommit[],
): Promise<TestRepo> {
  await mkdir(path, { recursive: true });

  await Bun.$`git init -q -b main ${path}`.quiet();

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

    await Bun.$`git -C ${path} add -A`.quiet();
    await Bun.$`git -C ${path} -c user.email=test@example.com -c user.name=test commit -q --allow-empty -m ${commit.message}`.quiet();

    const sha = await Bun.$`git -C ${path} rev-parse HEAD`.text();

    shas.push(sha.trim());
  }

  return { path, commits: shas };
}
