import { z } from 'zod';
import { depthSchema } from './depth';
import { droppedFindingSchema } from './dropped-finding';
import { effortSchema } from './effort';
import { findingSchema } from './finding';
import { callLensSchema, lensIDSchema } from './lens-id';
import { tokensSchema } from './tokens';

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

export const notReviewedFileSchema = z.strictObject({
  path: z.string().min(1),
  reason: z.enum(['data', 'too-large']),
});

export type NotReviewedFile = z.infer<typeof notReviewedFileSchema>;

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

export const fixCheckSchema = z.strictObject({
  findingID: z.string().regex(/^[0-9a-f]{16}$/u),
  fixed: z.boolean(),
  reason: z.string().min(1),
});

export type FixCheck = z.infer<typeof fixCheckSchema>;

export const unjudgedFixSchema = z.strictObject({
  findingID: z.string().regex(/^[0-9a-f]{16}$/u),
  reason: z.string().min(1),
});

export type UnjudgedFix = z.infer<typeof unjudgedFixSchema>;

export const resolutionCheckSchema = z.strictObject({
  merge: commitSchema,
  sound: z.boolean(),
  reason: z.string().min(1),

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

  fixesOnly: z.literal(true).optional(),

  fixChecks: z.array(fixCheckSchema).optional(),
  unjudgedFixes: z.array(unjudgedFixSchema).optional(),

  resolutionChecks: z.array(resolutionCheckSchema).optional(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
});

export type ReviewResult = z.infer<typeof reviewResultSchema>;
