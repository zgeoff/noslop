import type { Runner } from '@noslop/runner';
import { readRebasedHead } from './read-rebased-head';

export interface MappedReviewInput {
  repoDir: string;

  // the head of the last review with no failed call, which the branch no longer holds
  reviewed: string;

  // the head of the last lens review, at or below the reviewed head
  lensHead: string | null;

  // the pull request's base and head now
  base: string;
  head: string;

  // the base the lens review's commits count from, as the store keeps it
  reviewBase: string | null;
}

export interface MappedReview {
  // the head the mapping read, the reviewed head or the lens head
  from: string;

  // the branch commit that stands for it, and why none does
  head: string | null;
  failure: string | null;
}

// the branch commit a rebase made of the reviewed head, or else of the lens head: a fixes-only run
// records its own head as its base, so a rebase of a lower stack layer under it leaves only the lens
// review's base to count from, and the fix commits after the lens head then take the fix path
export async function readMappedReview(
  runner: Runner,
  input: MappedReviewInput,
): Promise<MappedReview> {
  // a clone fetched at the reviewed head lacks the lens history a rebase left behind it
  await Promise.all(
    [input.lensHead, input.reviewBase].map((commit) => readCommit(runner, input.repoDir, commit)),
  );

  // a base that no fetch reached would fail the commit list, so the mapping counts from the base
  const isBaseHeld =
    input.reviewBase === null ? false : await probeCommit(runner, input.repoDir, input.reviewBase);

  const held = { ...input, reviewBase: isBaseHeld ? input.reviewBase : null };

  const mapped = await readRebasedHead(runner, held);

  if (mapped.head !== null || input.lensHead === null || input.lensHead === input.reviewed) {
    return { from: input.reviewed, ...mapped };
  }

  const lensHead = input.lensHead;

  const lens = await readRebasedHead(runner, { ...held, reviewed: lensHead });

  return lens.head === null ? { from: input.reviewed, ...mapped } : { from: lensHead, ...lens };
}

// a missing commit makes the whole fetch fail, so each commit gets a fetch of its own
async function readCommit(runner: Runner, repoDir: string, commit: string | null): Promise<void> {
  if (commit === null) {
    return;
  }

  const isHeld = await probeCommit(runner, repoDir, commit);

  if (isHeld) {
    return;
  }

  await runner.run(['git', 'fetch', '--quiet', 'origin', commit], { cwd: repoDir });
}

async function probeCommit(runner: Runner, repoDir: string, commit: string): Promise<boolean> {
  const result = await runner.run(['git', 'cat-file', '-e', `${commit}^{commit}`], {
    cwd: repoDir,
  });

  return result.exitCode === 0;
}
