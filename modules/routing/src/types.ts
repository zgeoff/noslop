import type { Depth, Effort, LensID, ReviewConfig, SpecialChange } from '@noslop/contract';
import type { Change, ChangedFile, RiskSignals, Slices } from '@noslop/static-stage';

export interface RouteInput {
  change: Change;
  slices: Slices;
  signals: RiskSignals;
  config: ReviewConfig;
  linkedIssue: string | null;
  isSync: boolean;
  isRelease: boolean;

  // a review of a push to the default branch, with no pull request to hold its findings
  isPush: boolean;

  // the folder of each package manifest at the head, so a chunk holds the files of one package
  packageDirs: readonly string[];
}

export interface PlannedCall {
  callID: string;
  lenses: LensID[];
  effort: Effort;
  model: string | null;
  timeoutMs: number | null;
  files: ChangedFile[];
}

export interface Route {
  special: SpecialChange | null;
  lenses: LensID[];
  depth: Depth;
  calls: PlannedCall[];
}
