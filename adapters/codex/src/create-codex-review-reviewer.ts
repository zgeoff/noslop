import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CaseReviewer } from '@noslop/eval';
import type { Runner } from '@noslop/runner';
import { z } from 'zod';
import { loadReviewSessionTokens } from './load-review-session-tokens';
import { parseCodexReview } from './parse-codex-review';

export interface CodexReviewReviewerOptions {
  runner: Runner;
  tempDir: string;
  timeoutMs: number;

  // the Codex executable, `codex` on the path unless a caller names another
  command?: string;

  // the folder that holds the user's Codex config and the sessions Codex writes
  codexHome?: string;
}

const threadSchema = z.looseObject({ type: z.literal('thread.started'), thread_id: z.string() });

// the reference reviewer: `codex review` of the case's change, read-only in the reviewed worktree; its
// runs on the corpus record the baseline and measure the noise floor; Codex keeps the review's
// session files, because the review's token use is in them alone
export function createCodexReviewReviewer(options: CodexReviewReviewerOptions): CaseReviewer {
  return {
    id: 'codex-review',
    reviewCase: async (corpusCase, worktree) => {
      const outDir = await mkdtemp(join(options.tempDir, 'codex-review-'));

      const outFile = join(outDir, 'last-message.txt');
      const since = Date.now();

      const result = await options.runner.run(
        [
          options.command ?? 'codex',
          'exec',
          'review',
          '--base',
          corpusCase.base,
          '--json',
          '-c',
          'sandbox_mode="read-only"',
          '-o',
          outFile,
        ],
        { cwd: worktree, timeoutMs: options.timeoutMs },
      );

      const text = await Bun.file(outFile)
        .text()
        .catch(() => '');

      await rm(outDir, { recursive: true, force: true });

      const failed = result.exitCode !== 0 || result.timedOut || text === '';

      return {
        findings: parseCodexReview(text, worktree),
        failed,
        tokens: failed
          ? { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 }
          : await loadReviewSessionTokens({
              codexHome: options.codexHome ?? Bun.env['CODEX_HOME'] ?? join(homedir(), '.codex'),
              threadID: requireThreadID(result.stdout),
              since,
            }),
        durationMs: result.durationMs,
        calls: 1,
        depth: null,
      };
    },
  };
}

// a review that ends without the event that names its thread leaves no session to count
function requireThreadID(stdout: string): string {
  for (const line of stdout.split('\n')) {
    const event = threadSchema.safeParse(parseJSONLine(line));

    if (event.success) {
      return event.data.thread_id;
    }
  }

  throw new Error('codex review printed no thread, so its token use cannot be read');
}

function parseJSONLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
