import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Tokens } from '@noslop/contract';
import { mergeTokens } from '@noslop/contract';
import { z } from 'zod';
import { buildTokensFromCodexUsage, codexUsageSchema } from './build-tokens-from-codex-usage';

export interface ReviewSessionQuery {
  // the folder that holds the user's Codex config and its sessions folder
  codexHome: string;

  // the thread that `codex exec review` started, from its first event
  threadID: string;

  // when the review started, in epoch milliseconds; a session file written before it is another run's
  since: number;
}

const metaSchema = z.looseObject({
  type: z.literal('session_meta'),
  payload: z.looseObject({ id: z.string(), parent_thread_id: z.string().optional() }),
});

const tokenCountSchema = z.looseObject({
  type: z.literal('event_msg'),
  payload: z.looseObject({
    type: z.literal('token_count'),
    info: z.looseObject({ total_token_usage: codexUsageSchema }),
  }),
});

export interface ReviewSession {
  tokens: Tokens;

  // the session files of the review thread and of each thread it started
  files: string[];

  // whether Codex wrote a session for a thread the review started, which holds the review's tokens
  hasReviewThread: boolean;
}

// `codex exec review` runs the review in a subagent thread and reports no token use for it, so the
// tokens come from the session files Codex writes for the review thread and each thread it started;
// Codex files a session under the local date it began, and a thread's last count holds its total
export async function loadReviewSession(query: ReviewSessionQuery): Promise<ReviewSession> {
  const candidates = await readSessionFiles(query);

  const threads: Tokens[] = [];
  const files: string[] = [];
  let hasReviewThread = false;

  for (const file of candidates) {
    // another review that shares the Codex home removes its own files once it has read them
    const text = await Bun.file(file)
      .text()
      .catch(() => '');

    const lines = text.split('\n');
    const meta = metaSchema.safeParse(parseJSONLine(lines[0] ?? ''));

    if (!meta.success) {
      continue;
    }

    const isChild = meta.data.payload.parent_thread_id === query.threadID;

    if (meta.data.payload.id !== query.threadID && !isChild) {
      continue;
    }

    files.push(file);

    hasReviewThread ||= isChild;

    const last = lines
      .map((line) => tokenCountSchema.safeParse(parseJSONLine(line)))
      .findLast((event) => event.success);

    if (last?.success === true) {
      threads.push(buildTokensFromCodexUsage(last.data.payload.info.total_token_usage));
    }
  }

  return { tokens: mergeTokens(threads), files, hasReviewThread };
}

const DAY_MS = 86_400_000;

async function readSessionFiles(query: ReviewSessionQuery): Promise<string[]> {
  const files: string[] = [];

  // the day before covers a local date behind the review's own start
  for (let day = query.since - DAY_MS; day <= Date.now() + DAY_MS; day += DAY_MS) {
    const date = new Date(day);

    const directory = join(
      query.codexHome,
      'sessions',
      String(date.getFullYear()),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    );

    const names = await readdir(directory).catch(() => []);

    for (const name of names.filter((candidate) => candidate.endsWith('.jsonl'))) {
      const info = await stat(join(directory, name)).catch(() => null);

      if (info !== null && info.mtimeMs >= query.since) {
        files.push(join(directory, name));
      }
    }
  }

  return files;
}

function parseJSONLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
