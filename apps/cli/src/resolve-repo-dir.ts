import type { CLIContext } from './cli-context';

export async function resolveRepoDir(ctx: CLIContext): Promise<string> {
  const result = await ctx.runner.run(['git', 'rev-parse', '--show-toplevel'], { cwd: ctx.cwd });

  return result.exitCode === 0 ? result.stdout.trim() : ctx.cwd;
}
