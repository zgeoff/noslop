// the versioned review result, the public contract of `noslop review --json`, with its schema so a
// caller can validate a result it receives
export {
  REVIEW_OUTPUT_VERSION,
  dispositionSchema,
  droppedFindingSchema,
  findingSchema,
  pullRequestRefSchema,
  reviewResultSchema,
} from '@noslop/contract';

export type {
  Anchor,
  CallRecord,
  Disposition,
  DispositionKind,
  DroppedFinding,
  FailedCall,
  Finding,
  PullRequestRef,
  ReviewResult,
  SecondLocation,
  SpecialChange,
} from '@noslop/contract';
