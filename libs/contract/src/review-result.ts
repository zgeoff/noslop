import { z } from 'zod';
import { depthSchema } from './depth';
import { droppedFindingSchema } from './dropped-finding';
import { effortSchema } from './effort';
import { findingSchema } from './finding';
import { callLensSchema, lensIDSchema } from './lens-id';
import { tokensSchema } from './tokens';

// changes only with a breaking change to the output, so a consumer that pins a CLI version reads one
// shape
export const REVIEW_OUTPUT_VERSION = 7;
const commitSchema = z.string().regex(/^[0-9a-f]{40}$/u);

export const callRecordSchema = z.strictObject({
  id: z.string().min(1),
  lenses: z.array(callLensSchema).min(1),
  depth: depthSchema,
  adapter: z.string().min(1),
  model: z.string().min(1).nullable(),
  effort: effortSchema,
  status: z.enum(['ok', 'failed']),
  attempts: z.int().positive(),
  tokens: tokensSchema,
  durationMs: z.int().nonnegative(),
});

export type CallRecord = z.infer<typeof callRecordSchema>;

export const failedCallSchema = z.strictObject({
  id: z.string().min(1),
  lenses: z.array(callLensSchema).min(1),
  reason: z.string().min(1),
});

export type FailedCall = z.infer<typeof failedCallSchema>;

// a changed file that no call read: a match of the config's data globs, or a file too large for a
// call
export const notReviewedFileSchema = z.strictObject({
  path: z.string().min(1),
  reason: z.enum(['data', 'too-large']),
});

export type NotReviewedFile = z.infer<typeof notReviewedFileSchema>;

// a file that the calls of the listed lenses did not read, such as a changed file another call read,
// or the file of an earlier design finding on a review that ran no design call, so a reporter reads no
// silence of those lenses on it as a fix
export const lensNotReviewedFileSchema = z.strictObject({
  path: z.string().min(1),
  lenses: z.array(callLensSchema).min(1),
});

export type LensNotReviewedFile = z.infer<typeof lensNotReviewedFileSchema>;

export const specialChangeSchema = z.enum(['sync', 'release', 'docs-only', 'direct-push']);

export type SpecialChange = z.infer<typeof specialChangeSchema>;

export const pullRequestRefSchema = z.strictObject({
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.int().positive(),
});

export type PullRequestRef = z.infer<typeof pullRequestRefSchema>;

// a fix call's word on one `fixed` answer: whether the head still holds the finding, and the one-line
// reason
export const fixCheckSchema = z.strictObject({
  findingID: z.string().regex(/^[0-9a-f]{16}$/u),
  fixed: z.boolean(),
  reason: z.string().min(1),
});

export type FixCheck = z.infer<typeof fixCheckSchema>;

// a `fixed` answer that a run asked about and no call judged, with why: its fix call failed, or its
// code or diff passes the file limit
export const unjudgedFixSchema = z.strictObject({
  findingID: z.string().regex(/^[0-9a-f]{16}$/u),
  reason: z.string().min(1),
});

export type UnjudgedFix = z.infer<typeof unjudgedFixSchema>;

// a fixes-only run's word on one merge commit whose tree differs from the tree `git merge-tree` builds
// from its parents: whether what the merge itself wrote, its conflict resolutions and hand edits,
// keeps the change of each side and adds no defect, and the one-line reason
export const resolutionCheckSchema = z.strictObject({
  merge: commitSchema,
  sound: z.boolean(),
  reason: z.string().min(1),

  // the findings the check raised on the resolution, so a reader tells a verdict its findings carry
  // from one that only the verdict reports
  findingIDs: z.array(z.string().regex(/^[0-9a-f]{16}$/u)),
});

export type ResolutionCheck = z.infer<typeof resolutionCheckSchema>;

export const reviewResultSchema = z.strictObject({
  version: z.literal(REVIEW_OUTPUT_VERSION),
  reviewID: z.string().min(1),
  repo: z.string().min(1),
  pullRequest: pullRequestRefSchema.nullable(),
  base: commitSchema,
  head: commitSchema,
  title: z.string().nullable(),
  depth: depthSchema,
  special: specialChangeSchema.nullable(),
  riskClasses: z.array(z.string().min(1)),
  lenses: z.array(lensIDSchema),
  calls: z.array(callRecordSchema),
  findings: z.array(findingSchema),
  dropped: z.array(droppedFindingSchema),
  failedCalls: z.array(failedCallSchema),
  notReviewed: z.array(notReviewedFileSchema),
  notReviewedByLens: z.array(lensNotReviewedFileSchema),
  configHash: z.string().min(1),

  // set only on a fixes-only run, which runs no lens, so it is no review round
  fixesOnly: z.literal(true).optional(),

  // the verdict of each fix call: a fixes-only run's, or a review's for each `fixed` answer whose
  // finding it no longer reported; only a verdict confirms a fix, never a finding's absence
  fixChecks: z.array(fixCheckSchema).optional(),

  // each `fixed` answer the run asked about with no verdict, which stays unconfirmed and is never
  // judged not fixed
  unjudgedFixes: z.array(unjudgedFixSchema).optional(),

  // set only on a fixes-only run that judged a merge in its range; a clean merge gets no check
  resolutionChecks: z.array(resolutionCheckSchema).optional(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
});

export type ReviewResult = z.infer<typeof reviewResultSchema>;
