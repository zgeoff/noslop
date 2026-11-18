import { createRunner } from '@noslop/runner';
import { WringerError } from '@wringer/core';
import { z } from 'zod';

const claudeStatusSchema = z.object({ loggedIn: z.boolean() });

// Both journeys call a real model, so each model CLI must be signed in: `review-and-fix` runs
// claude, and `review-on-codex` runs codex.
export async function checkModelCLIs(cwd: string): Promise<{ claude: true; codex: true }> {
  const runner = createRunner();

  const claude = await runner.run(['claude', 'auth', 'status'], { cwd, timeoutMs: 20_000 });

  const claudeStatus = claudeStatusSchema.safeParse(parseJSON(claude.stdout));

  if (claude.exitCode !== 0 || claudeStatus.data?.loggedIn !== true) {
    throw new WringerError('check-failed', {
      message: '`claude auth status` does not print "loggedIn": true',
      hint: 'Sign claude in with `claude auth login`.',
    });
  }

  const codex = await runner.run(['codex', 'login', 'status'], { cwd, timeoutMs: 20_000 });

  if (codex.exitCode !== 0) {
    throw new WringerError('check-failed', {
      message: `\`codex login status\` exited ${String(codex.exitCode)}`,
      hint: 'Sign codex in with `codex login`.',
    });
  }

  return { claude: true, codex: true };
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
