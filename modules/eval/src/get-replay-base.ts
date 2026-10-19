import type { Case } from './case';

// the commit a replay of the case reviews from: the last reviewed head of a re-review, so the review
// covers only the push, as a live re-review of the pull request does, or else the case's base
export function getReplayBase(corpusCase: Case): string {
  return corpusCase.reviewedHead ?? corpusCase.base;
}
