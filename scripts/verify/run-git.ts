import { createRunner } from '@noslop/runner';
import { WringerError } from '@wringer/core';

// Runs git in the run's clone. The clone's credential helper hands git the token from GH_TOKEN.
export async function runGit(
  clone: string,
  args: readonly string[],
  token: string,
): Promise<string> {
  const result = await createRunner().run(['git', ...args], {
    cwd: clone,
    env: { GH_TOKEN: token, GIT_TERMINAL_PROMPT: '0' },
    timeoutMs: 60_000,
  });

  if (result.exitCode !== 0) {
    throw new WringerError('environment', {
      message: `git ${args[0] ?? ''} failed in the run's clone: ${result.stderr.trim()}`,
    });
  }

  return result.stdout.trim();
}
