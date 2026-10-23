import type { Depth, FindingLens, Tokens } from '@noslop/contract';
import type { Case } from './case';
import type { ReportedFinding } from './collect-matches';

export interface CaseReview {
  findings: ReportedFinding[];
  failed: boolean;
  tokens: Tokens;
  durationMs: number;
  calls: number;

  // the depth noslop picked; a reference reviewer has none
  depth: Depth | null;

  // the lenses of the calls that errored or timed out; a reference reviewer, and a run recorded
  // before the field, names none
  failedLenses?: FindingLens[] | undefined;

  // the findings noslop's Assemble dropped, with the reason; a reference reviewer drops none
  dropped?: DroppedFinding[] | undefined;
}

export interface DroppedFinding {
  lens: string;
  title: string;
  reason: string;
  rule: string | null;
  ruleQuote: string | null;
}

// a reviewer under test: noslop itself, or a reference reviewer whose runs set the baseline; it reads
// the case's reviewed head from a detached worktree that the harness creates and removes
export interface CaseReviewer {
  id: string;

  // false for a reviewer that checks out the head on its own, so the harness adds no worktree
  needsWorktree?: boolean;
  reviewCase: (corpusCase: Case, worktree: string) => Promise<CaseReview>;
}

export interface CaseRun {
  caseID: string;
  review: CaseReview;
}
