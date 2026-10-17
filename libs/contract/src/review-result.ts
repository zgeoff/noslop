import { z } from 'zod';
import { depthSchema } from './depth';
import { effortSchema } from './effort';
import { findingSchema } from './finding';
import { lensIDSchema } from './lens-id';
import { tokensSchema } from './tokens';

// changes only with a breaking change to the output, so a consumer that pins a CLI version reads one
// shape
export const REVIEW_OUTPUT_VERSION = 4;
const commitSchema = z.string().regex(/^[0-9a-f]{40}$/u);

export const callRecordSchema = z.strictObject({
  id: z.string().min(1),
  lenses: z.array(lensIDSchema).min(1),
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
  lenses: z.array(lensIDSchema).min(1),
  reason: z.string().min(1),
});

export type FailedCall = z.infer<typeof failedCallSchema>;

export const specialChangeSchema = z.enum(['sync', 'release', 'docs-only', 'direct-push']);

export type SpecialChange = z.infer<typeof specialChangeSchema>;

export const pullRequestRefSchema = z.strictObject({
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.int().positive(),
});

export type PullRequestRef = z.infer<typeof pullRequestRefSchema>;

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
  failedCalls: z.array(failedCallSchema),
  configHash: z.string().min(1),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
});

export type ReviewResult = z.infer<typeof reviewResultSchema>;
