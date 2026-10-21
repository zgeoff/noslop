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
  const mapped = await readRebasedHead(runner, input);

  if (mapped.head !== null || input.lensHead === null || input.lensHead === input.reviewed) {
    return { from: input.reviewed, ...mapped };
  }

  const lensHead = input.lensHead;

  // a missing commit makes the whole fetch fail, so the lens head gets a fetch of its own
  await runner.run(['git', 'fetch', '--quiet', 'origin', lensHead], { cwd: input.repoDir });

  const lens = await readRebasedHead(runner, { ...input, reviewed: lensHead });

  return lens.head === null ? { from: input.reviewed, ...mapped } : { from: lensHead, ...lens };
}
