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

  isPush: boolean;
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
