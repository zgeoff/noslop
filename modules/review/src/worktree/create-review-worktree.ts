import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@logtape/logtape';
import type { ReviewConfig } from '@noslop/contract';
import type { Runner } from '@noslop/runner';

export interface ReviewWorktreeOptions {
  runner: Runner;
  repoDir: string;

  worktree: string;
  head: string;
  config: ReviewConfig;
  logger: Logger;
}

export async function createReviewWorktree(options: ReviewWorktreeOptions): Promise<void> {
  const result = await options.runner.run(
    ['git', 'worktree', 'add', '--detach', options.worktree, options.head],
    { cwd: options.repoDir },
  );

  if (result.exitCode !== 0) {
    throw new Error(`git worktree add failed: ${result.stderr.trim()}`);
  }

  await removeSecretFiles(options);
}

async function removeSecretFiles(options: ReviewWorktreeOptions): Promise<void> {
  const globs = (options.config.riskClasses['secrets']?.paths ?? []).map(
    (glob) => new Bun.Glob(glob),
  );

  if (globs.length === 0) {
    return;
  }

  const listed = await options.runner.run(['git', 'ls-files', '-z'], { cwd: options.worktree });

  const secrets = listed.stdout
    .split('\0')
    .filter((path) => path !== '' && globs.some((glob) => glob.match(path)));

  // a submodule lists as one path and checks out as a folder, so the removal is recursive
  await Promise.all(
    secrets.map((path) => rm(join(options.worktree, path), { recursive: true, force: true })),
  );
}
