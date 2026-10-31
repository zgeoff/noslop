import type { Depth, FindingLens, Tokens } from '@noslop/contract';
import type { Case } from './case';
import type { ReportedFinding } from './collect-matches';

export interface CaseReview {
  findings: ReportedFinding[];
  failed: boolean;
  tokens: Tokens;
  durationMs: number;
  calls: number;

  depth: Depth | null;

  failedLenses?: FindingLens[] | undefined;

  dropped?: DroppedFinding[] | undefined;

  fixChecks?: CaseFixCheck[] | undefined;
}

export interface CaseFixCheck {
  findingID: string;

  fixed: boolean | null;
  reason: string;
}

export interface DroppedFinding {
  lens: string;
  title: string;
  reason: string;
  rule: string | null;
  ruleQuote: string | null;
}

export interface CaseReviewer {
  id: string;

  needsWorktree?: boolean;
  reviewCase: (corpusCase: Case, worktree: string) => Promise<CaseReview>;
}

export interface CaseRun {
  caseID: string;
  review: CaseReview;
}
