import { mkdir, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildChildEnv } from '@noslop/runner';

export interface TestCommit {
  message: string;

  // each path's content after the commit; null removes the file
  files: Readonly<Record<string, string | null>>;

  // each symlink's target after the commit, as the link stores it
  links?: Readonly<Record<string, string>>;

  // the index of the earlier commit this one follows, in place of the one before it, so a test can
  // build a second line of history, such as commits on a base branch
  parent?: number;

  // the index of an earlier commit this one merges in as its second parent, or a list of them for an
  // octopus merge; the files apply on top of the merged tree, and they resolve a conflict the merge left
  merged?: number | readonly number[];

  // the author and committer date git records, in a form git reads, such as an ISO 8601 date; with
  // none, git records the time of the commit
  date?: string;

  // the author date alone, in place of the date, such as the older author date a rebase keeps
  authorDate?: string;
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
  const env = buildChildEnv(process.env);

  const $ = new Bun.$.Shell().env(env);

  await mkdir(path, { recursive: true });

  await $`git init -q -b main ${path}`.quiet();

  const shas: string[] = [];

  for (const commit of commits) {
    if (commit.parent !== undefined) {
      await $`git -C ${path} checkout -q --detach ${getCommit(shas, commit.parent)}`.quiet();
    }

    // a merge with a conflict stops with the conflict markers in place, and the entry's files resolve
    // it; a merge that git could not start leaves no MERGE_HEAD
    if (commit.merged !== undefined) {
      const indexes = typeof commit.merged === 'number' ? [commit.merged] : commit.merged;
      const merged = indexes.map((index) => getCommit(shas, index));

      const merge =
        await $`git -C ${path} -c user.email=test@example.com -c user.name=test merge -q --no-ff --no-commit ${merged}`
          .nothrow()
          .quiet();

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
