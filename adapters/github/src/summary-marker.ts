import { z } from 'zod';
import { netChangeKeySchema } from './net-change-key';

export const summaryMarkerSchema = z.strictObject({
  head: buildShaSchema(),

  key: netChangeKeySchema.optional(),

  // Markers already posted on GitHub may hold these fields, which nothing reads. The schema rejects
  // an unknown key, so it accepts them to parse such a marker.
  base: z.unknown().optional(),
  earlier: z.unknown().optional(),
  notReviewed: z.unknown().optional(),
  notReviewedByLens: z.unknown().optional(),
  reviews: z.int().nonnegative(),
  reported: z.array(z.string()),
  failedCalls: z.int().nonnegative(),
  followUps: z.array(z.string()).default([]),
  confirmed: z.array(z.string()).default([]),

  checked: z.array(z.string()).optional(),

  lensHead: buildShaSchema().optional(),
  lensKey: netChangeKeySchema.optional(),

  checkedMerges: z.array(buildShaSchema()).optional(),

  rejectedMerges: z.array(buildShaSchema()).optional(),
  reviewIDs: z.array(z.string()).optional(),

  startedAt: z.iso.datetime().optional(),
});

function buildShaSchema() {
  return z.string().regex(/^[0-9a-f]{40}$/u);
}

export type SummaryMarker = z.infer<typeof summaryMarkerSchema>;
