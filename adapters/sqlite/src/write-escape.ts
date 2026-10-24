import { randomUUID } from 'node:crypto';
import type { Store } from './load-store';

export interface Escape {
  repo: string;

  issue: string;
  head: string;
  lens: string | null;
  defect: string;
  path: string | null;
  startLine: number | null;
  endLine: number | null;
  recordedAt: string;
}

export async function writeEscape(store: Store, escape: Escape): Promise<string> {
  const escapeID = randomUUID();

  await store
    .insertInto('escapes')
    .values({
      escape_id: escapeID,
      repo: escape.repo,
      issue: escape.issue,
      head: escape.head,
      lens: escape.lens,
      defect: escape.defect,
      path: escape.path,
      start_line: escape.startLine,
      end_line: escape.endLine,
      recorded_at: escape.recordedAt,
    })
    .execute();

  return escapeID;
}
