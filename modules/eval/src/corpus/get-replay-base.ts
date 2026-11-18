import type { Case } from './case';

export function getReplayBase(corpusCase: Case): string {
  return corpusCase.reviewedHead ?? corpusCase.base;
}
