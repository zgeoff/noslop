import type { Depth } from '@noslop/contract';
import type { Case } from './case';
import type { ReportedFinding } from './collect-matches';

export interface CaseReview {
  findings: ReportedFinding[];
  failed: boolean;
  tokens: { input: number; output: number };
  durationMs: number;
  calls: number;

  // the depth noslop picked; a reference reviewer has none
  depth: Depth | null;
}

// a reviewer under test: noslop itself, or a reference reviewer whose runs set the baseline; it reads
// the case's reviewed head from a detached worktree that the harness creates and removes
export interface CaseReviewer {
  id: string;
  reviewCase: (corpusCase: Case, worktree: string) => Promise<CaseReview>;
}

export interface CaseRun {
  caseID: string;
  review: CaseReview;
}
