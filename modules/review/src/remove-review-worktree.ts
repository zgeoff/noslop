import type { ReviewWorktreeOptions } from './create-review-worktree';

// a worktree that git cannot remove leaves an entry in the repo's worktree list, so the review
// logs it for the user to prune
export async function removeReviewWorktree(options: ReviewWorktreeOptions): Promise<void> {
  const result = await options.runner.run(
    ['git', 'worktree', 'remove', '--force', options.worktree],
    { cwd: options.repoDir },
  );

  if (result.exitCode !== 0) {
    options.logger.warn('git could not remove the worktree {worktree}: {stderr}', {
      worktree: options.worktree,
      stderr: result.stderr.trim(),
    });
  }
}
