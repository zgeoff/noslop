import type { Runner } from '@noslop/runner';

export interface RebasedHeadInput {
  repoDir: string;

  // the head of the earlier review, which the branch no longer holds
  reviewed: string;

  // the pull request's base and head now
  base: string;
  head: string;
}

export interface RebasedHead {
  // the branch commit that stands for the reviewed head
  head: string | null;

  // why no branch commit stands for it, which the refusal gives
  failure: string | null;
}

// the branch commit a rebase made of a reviewed head: the reviewed commits past the base, with any
// the base now holds left out, must open the branch in order, each with the same patch; a merge, a
// conflict resolution or any other change to a reviewed patch maps no head
export async function findRebasedHead(
  runner: Runner,
  input: RebasedHeadInput,
): Promise<RebasedHead> {
  const readable = await runner.run(['git', 'cat-file', '-e', `${input.reviewed}^{commit}`], {
    cwd: input.repoDir,
  });

  if (readable.exitCode !== 0) {
    return toFailure(`the repo holds no commit ${toShort(input.reviewed)}`);
  }

  // a stack's base branch may have rebased too, so a reviewed commit the base holds the patch of is
  // the base's own and not the pull request's
  const reviewed = await readCommits(runner, input.repoDir, [
    '--right-only',
    '--cherry-pick',
    `${input.base}...${input.reviewed}`,
  ]);

  const branch = await readCommits(runner, input.repoDir, [`${input.base}..${input.head}`]);

  if (reviewed.length === 0) {
    return toFailure(`the reviewed head ${toShort(input.reviewed)} holds no commit past the base`);
  }

  const merge = [...reviewed, ...branch.slice(0, reviewed.length)].find(
    (commit) => commit.parents > 1,
  );

  if (merge !== undefined) {
    return toFailure(`the merge ${toShort(merge.sha)} takes a full review`);
  }

  if (branch.length < reviewed.length) {
    return toFailure(
      `the branch holds ${branch.length} of the ${reviewed.length} reviewed commits past the base`,
    );
  }

  const paired = branch.slice(0, reviewed.length);

  const ids = await readPatchIDs(runner, input.repoDir, [
    ...reviewed.map((commit) => commit.sha),
    ...paired.map((commit) => commit.sha),
  ]);

  const empty = reviewed.find((commit) => !ids.has(commit.sha));

  if (empty !== undefined) {
    return toFailure(`the reviewed commit ${toShort(empty.sha)} has no patch to match`);
  }

  const changed = reviewed.findIndex(
    (commit, index) => ids.get(commit.sha) !== ids.get(paired[index]?.sha ?? ''),
  );

  if (changed !== -1) {
    const sha = reviewed[changed]?.sha ?? '';

    return toFailure(`the rebase changed the patch of the reviewed commit ${toShort(sha)}`);
  }

  return { head: paired.at(-1)?.sha ?? null, failure: null };
}

function toFailure(failure: string): RebasedHead {
  return { head: null, failure };
}

function toShort(sha: string): string {
  return sha.slice(0, 12);
}

interface ListedCommit {
  sha: string;
  parents: number;
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
