import { z } from 'zod';

// the latest review as the summary marker keeps it; `followUps` stops a later review filing an issue
// twice, `confirmed` holds each `<finding id>:<commit>` fix a re-review read, so a later delta keeps
// it, and `reviewIDs` holds every review counted, so a repost of any of them adds no review
export const summaryMarkerSchema = z.strictObject({
  head: z.string().regex(/^[0-9a-f]{40}$/u),

  // the range the review covered and the files it left out, so an answer after it counts its read
  base: z
    .string()
    .regex(/^[0-9a-f]{40}$/u)
    .optional(),
  reviews: z.int().positive(),
  reported: z.array(z.string()),
  failedCalls: z.int().nonnegative(),
  followUps: z.array(z.string()).default([]),
  confirmed: z.array(z.string()).default([]),
  notReviewed: z.array(z.string()).optional(),
  reviewIDs: z.array(z.string()).optional(),

  // when the review that wrote the summary started, so a retry of an earlier review leaves it alone
  startedAt: z.iso.datetime().optional(),
});

export type SummaryMarker = z.infer<typeof summaryMarkerSchema>;
