import { mkdir, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildChildEnv } from '@noslop/runner';

export interface TestCommit {
  message: string;

  files: Readonly<Record<string, string | null>>;

  links?: Readonly<Record<string, string>>;

  parent?: number;

  merged?: number | readonly number[];

  date?: string;
  authorDate?: string;
}

export interface TestRepo {
  path: string;
  commits: string[];
}

export async function createTestRepo(
  path: string,
  commits: readonly TestCommit[],
): Promise<TestRepo> {
  // A git hook sets GIT_DIR, so git runs without the repo variables or a test inside a hook would
  // commit into the hook's repo. The shell is a new one because setting the env of Bun.$ changes
  // it for every caller.
  const env = buildChildEnv(process.env);

  const $ = new Bun.$.Shell().env(env);

  await mkdir(path, { recursive: true });

  await $`git init -q -b main ${path}`.quiet();

  const shas: string[] = [];

  for (const commit of commits) {
    if (commit.parent !== undefined) {
      await $`git -C ${path} checkout -q --detach ${getCommit(shas, commit.parent)}`.quiet();
    }

    if (commit.merged !== undefined) {
      const indexes = typeof commit.merged === 'number' ? [commit.merged] : commit.merged;
      const merged = indexes.map((index) => getCommit(shas, index));

      const merge =
        await $`git -C ${path} -c user.email=test@example.com -c user.name=test merge -q --no-ff --no-commit ${merged}`
          .nothrow()
          .quiet();

      // A conflicted merge exits non-zero but leaves MERGE_HEAD, so MERGE_HEAD, not the exit code,
      // tells whether git started the merge.
      const pending = await $`git -C ${path} rev-parse -q --verify MERGE_HEAD`.nothrow().quiet();

      if (pending.exitCode !== 0) {
        throw new Error(`git merge failed: ${merge.stderr.toString().trim()}`);
      }
    }

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

    const authorDate = commit.authorDate ?? commit.date;

    const dates = {
      ...(authorDate === undefined ? {} : { GIT_AUTHOR_DATE: authorDate }),
      ...(commit.date === undefined ? {} : { GIT_COMMITTER_DATE: commit.date }),
    };

    await $`git -C ${path} -c user.email=test@example.com -c user.name=test commit -q --allow-empty -m ${commit.message}`
      .env({ ...env, ...dates })
      .quiet();

    const sha = await $`git -C ${path} rev-parse HEAD`.text();

    shas.push(sha.trim());
  }

  return { path, commits: shas };
}

function getCommit(shas: readonly string[], index: number): string {
  const sha = shas[index];

  if (sha === undefined) {
    throw new Error(`the test repo holds no commit ${index} before this one`);
  }

  return sha;
}
