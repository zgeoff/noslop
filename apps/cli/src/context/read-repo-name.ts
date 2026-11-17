import { basename } from 'node:path';
import type { CLIContext } from './cli-context';

export async function readRepoName(ctx: CLIContext, repoDir: string): Promise<string> {
  const result = await ctx.runner.run(['git', 'remote', 'get-url', 'origin'], { cwd: repoDir });

  const match = /[:/](?<owner>[^/:]+)\/(?<repo>[^/]+?)(?:\.git)?$/u.exec(result.stdout.trim());
  const owner = match?.groups?.['owner'];
  const repo = match?.groups?.['repo'];

  return result.exitCode === 0 && owner !== undefined && repo !== undefined
    ? `${owner}/${repo}`
    : basename(repoDir);
}
