import type { DismissedFinding, DispositionKind } from '@noslop/contract';
import { parseDisposition } from './parse-disposition';
import type { FindingThread } from './read-pull-request-state';

// each posted finding whose latest typed reply is `not-a-defect`, so a later review drops a new finding
// that matches it; a free-text reply after the answer leaves the answer standing
export function collectDismissedFindings(threads: readonly FindingThread[]): DismissedFinding[] {
  return threads
    .filter((thread) => findLatestKind(thread) === 'not-a-defect')
    .map((thread) => ({
      id: thread.marker.id,
      path: thread.marker.path,
      criterion: thread.marker.criterion ?? null,
      rule: thread.marker.rule ?? null,
      head: thread.marker.head ?? null,
      startLine: thread.startLine,
      endLine: thread.line,
    }));
}

function findLatestKind(thread: FindingThread): DispositionKind | null {
  const latest = thread.replies
    .toSorted((left, right) => left.at.localeCompare(right.at))
    .map((reply) => parseDisposition(reply.body))
    .findLast((parsed) => parsed !== null);

  return latest?.kind ?? null;
}
