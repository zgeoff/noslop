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

const DAY_MS = 86_400_000;

// `codex exec review` runs the review in a subagent thread and reports no token use for it, so the
// tokens come from the session files Codex writes for the review thread and each thread it started;
// Codex files a session under the local date it began, and a thread's last count holds its total
export async function loadReviewSessionTokens(query: ReviewSessionQuery): Promise<Tokens> {
  const files = await collectSessionFiles(query);

  const threads: Tokens[] = [];
  let found = false;

  for (const file of files) {
    const text = await Bun.file(file).text();

    const lines = text.split('\n');
    const meta = metaSchema.safeParse(parseJSONLine(lines[0] ?? ''));

    if (!meta.success) {
      continue;
    }

    const isChild = meta.data.payload.parent_thread_id === query.threadID;

    if (meta.data.payload.id !== query.threadID && !isChild) {
      continue;
    }

    found ||= isChild;

    const last = lines
      .map((line) => tokenCountSchema.safeParse(parseJSONLine(line)))
      .findLast((event) => event.success);

    if (last?.success === true) {
      threads.push(buildTokensFromCodexUsage(last.data.payload.info.total_token_usage));
    }
  }

  if (!found) {
    throw new Error(`codex wrote no review session for thread ${query.threadID}`);
  }

  return mergeTokens(threads);
}

async function collectSessionFiles(query: ReviewSessionQuery): Promise<string[]> {
  const files: string[] = [];

  // the day before covers a local date behind the review's own start
  for (let day = query.since - DAY_MS; day <= Date.now() + DAY_MS; day += DAY_MS) {
    const date = new Date(day);

    const dir = join(
      query.codexHome,
      'sessions',
      String(date.getFullYear()),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    );

    const names = await readdir(dir).catch(() => []);

    for (const name of names.filter((candidate) => candidate.endsWith('.jsonl'))) {
      const info = await stat(join(dir, name));

      if (info.mtimeMs >= query.since) {
        files.push(join(dir, name));
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
