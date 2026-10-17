import { randomUUID } from 'node:crypto';
import type { Store } from './load-store';

export interface Escape {
  repo: string;

  // the issue that reports the defect, and the head commit of the change that caused it
  issue: string;
  head: string;
  lens: string | null;
  defect: string;
  path: string | null;
  startLine: number | null;
  endLine: number | null;
  recordedAt: string;
}

// records a defect that a review missed, so recall per lens counts it and a later review of its file
// reads it as a past escape; returns the escape's id
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
