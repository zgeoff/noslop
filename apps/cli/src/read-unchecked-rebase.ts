import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection, NetChangeKey } from '@noslop/github';
import { collectChangedFiles, readNetChangeKey } from '@noslop/github';
import type { AnsweredFix } from '@noslop/review';
import type { Runner } from '@noslop/runner';

export interface UncheckedRebaseInput {
  connection: GitHubConnection;
  pullRequest: PullRequestRef;
  repoDir: string;

  // the key the summary marker holds, of the net change the reviews read
  stored: NetChangeKey | undefined;

  // the pull request's merge base and head now
  mergeBase: string;
  head: string;
  fixes: readonly AnsweredFix[];
}

// why a fixes-only run cannot pass a head that a rebase made, or null when it can: every file whose
// patch moved since the reviews must be one a fix commit the run judges changes, because the fix
// calls read only the fixes
export async function readUncheckedRebase(
  runner: Runner,
  input: UncheckedRebaseInput,
): Promise<string | null> {
  if (input.stored === undefined || 'head' in input.stored) {
    return 'the summary holds no key of the net change the reviews read';
  }

  const current = await readNetChangeKey(input.connection.client, input.pullRequest, input.head);

  if ('head' in current) {
    return 'GitHub gives no whole file list of the pull request';
  }

  const changed = collectChangedFiles(input.stored.files, current.files);

  const fixed = await readFixFiles(runner, input);

  const unchecked = changed.filter((path) => !fixed.has(path));

  return unchecked.length === 0
    ? null
    : `the patch of ${unchecked.join(', ')} changed since the review, and no fix commit changes it`;
}

// the files each fix commit on the branch changes, a merge's against its first parent, as the fix
// call reads a merge
async function readFixFiles(runner: Runner, input: UncheckedRebaseInput): Promise<Set<string>> {
  const listed = await runner.run(['git', 'rev-list', `${input.mergeBase}..${input.head}`], {
    cwd: input.repoDir,
  });

  const commits = listed.exitCode === 0 ? listed.stdout.trim().split('\n') : [];

  const named = input.fixes.flatMap((fix) => {
    const matches = commits.filter((commit) => commit.startsWith(fix.commit));

    return matches.length === 1 ? matches : [];
  });

  const files = await Promise.all(
    named.map((commit) =>
      runner.run(
        [
          'git',
          'diff-tree',
          '--diff-merges=first-parent',
          '--no-commit-id',
          '--name-only',
          '-r',
          '-z',
          commit,
        ],
        {
          cwd: input.repoDir,
        },
      ),
    ),
  );

  return new Set(
    files.flatMap((result) => result.stdout.split('\0').filter((path) => path !== '')),
  );
}
