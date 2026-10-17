import type { CLIContext } from './cli-context';

// the root of the git repo that holds the working directory, so a command run from a subfolder reads
// the repo's own review.json; outside a repo, the working directory itself
export async function resolveRepoDir(ctx: CLIContext): Promise<string> {
  const result = await ctx.runner.run(['git', 'rev-parse', '--show-toplevel'], { cwd: ctx.cwd });

  return result.exitCode === 0 ? result.stdout.trim() : ctx.cwd;
}
