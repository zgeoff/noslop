import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CaseReviewer } from '@noslop/eval';
import { getReplayBase } from '@noslop/eval';
import type { Runner } from '@noslop/runner';
import { z } from 'zod';
import { loadReviewSession } from './load-review-session';
import { parseCodexReview } from './parse-codex-review';

export interface CodexReviewReviewerOptions {
  runner: Runner;
  tempDir: string;
  timeoutMs: number;

  command?: string;

  codexHome?: string;
}

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
          getReplayBase(corpusCase),
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
      const threadID = findThreadID(result.stdout);

      const session =
        threadID === null
          ? null
          : await loadReviewSession({
              codexHome: options.codexHome ?? Bun.env['CODEX_HOME'] ?? join(homedir(), '.codex'),
              threadID,
              since,
            });

      await Promise.all(session?.files.map((file) => rm(file, { force: true })) ?? []);

      if (!failed && session?.hasReviewThread !== true) {
        throw new Error(
          'codex review left no session of its review thread to read its tokens from',
        );
      }

      return {
        findings: parseCodexReview(text, worktree),
        failed,
        tokens:
          failed || session === null
            ? { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 }
            : session.tokens,
        durationMs: result.durationMs,
        calls: 1,
        depth: null,
      };
    },
  };
}

const threadSchema = z.looseObject({ type: z.literal('thread.started'), thread_id: z.string() });

function findThreadID(stdout: string): string | null {
  for (const line of stdout.split('\n')) {
    const event = threadSchema.safeParse(parseJSONLine(line));

    if (event.success) {
      return event.data.thread_id;
    }
  }

  return null;
}

function parseJSONLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
