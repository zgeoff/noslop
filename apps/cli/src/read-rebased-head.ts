import type { Runner } from '@noslop/runner';
import type { ListedCommit, RebasedHead } from './pick-rebased-head';
import { pickRebasedHead } from './pick-rebased-head';

export interface RebasedHeadInput {
  repoDir: string;

  // the head of the earlier review, which the branch no longer holds
  reviewed: string;

  // the pull request's base and head now
  base: string;
  head: string;

  // the base the pull request's first review read; null counts the reviewed commits from `base`
  reviewBase: string | null;
}

// the branch commit a rebase made of a reviewed head, from the reviewed commits past the base, with
// any the base now holds left out, the branch commits past it, and the patch ids of both; the
// choice itself is pickRebasedHead's
export async function readRebasedHead(
  runner: Runner,
  input: RebasedHeadInput,
): Promise<RebasedHead> {
  const readable = await runner.run(['git', 'cat-file', '-e', `${input.reviewed}^{commit}`], {
    cwd: input.repoDir,
  });

  if (readable.exitCode !== 0) {
    return { head: null, failure: `the repo holds no commit ${input.reviewed.slice(0, 12)}` };
  }

  // a stack's base branch may have rebased too, so a reviewed commit the base holds the patch of is
  // the base's own and not the pull request's; a lower layer's squash holds no single commit's
  // patch, so its commits below the review's base, which its own review read, are left out too
  const reviewed = await readCommits(runner, input.repoDir, [
    '--right-only',
    '--cherry-pick',
    `${input.base}...${input.reviewed}`,
    ...(input.reviewBase === null ? [] : ['--not', input.reviewBase]),
  ]);

  const branch = await readCommits(runner, input.repoDir, [`${input.base}..${input.head}`]);

  const shas = [...reviewed, ...branch.slice(0, reviewed.length)].map((commit) => commit.sha);
  const patchIDs = shas.length === 0 ? new Map() : await readPatchIDs(runner, input.repoDir, shas);

  return pickRebasedHead({ reviewedHead: input.reviewed, reviewed, branch, patchIDs });
}

// the commits a rev-list range lists, oldest first, each with its count of parents
async function readCommits(
  runner: Runner,
  repoDir: string,
  args: readonly string[],
): Promise<ListedCommit[]> {
  const text = await readGitText(runner, repoDir, [
    'rev-list',
    '--reverse',
    '--topo-order',
    '--parents',
    ...args,
  ]);

  return text === ''
    ? []
    : text.split('\n').map((line) => {
        const [sha = '', ...parents] = line.split(' ');

        return { sha, parents: parents.length };
      });
}

async function readGitText(
  runner: Runner,
  repoDir: string,
  args: readonly string[],
): Promise<string> {
  const result = await runner.run(['git', ...args], { cwd: repoDir });

  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}

// each commit's patch id by its sha, which git keeps the same across file order and whitespace; a
// commit with no patch, such as an empty one, gets none
async function readPatchIDs(
  runner: Runner,
  repoDir: string,
  shas: readonly string[],
): Promise<Map<string, string>> {
  const patches = await readGitText(runner, repoDir, [
    'show',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--format=commit %H',
    '--patch',
    ...shas,
  ]);

  const result = await runner.run(['git', 'patch-id', '--stable'], {
    cwd: repoDir,
    stdin: `${patches}\n`,
  });

  if (result.exitCode !== 0) {
    throw new Error(`git patch-id failed: ${result.stderr.trim()}`);
  }

  const entries = result.stdout
    .trim()
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [id = '', sha = ''] = line.split(' ');

      return [sha, id] as const;
    });

  return new Map(entries);
}
