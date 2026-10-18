import { z } from 'zod';

// the latest review as the summary marker keeps it; `followUps` stops a later review filing an issue
// twice, `confirmed` holds each `<finding id>:<commit>` fix a re-review read, so a later delta that
// skips the file keeps it, and `reviewID` lets a second post of one result count as one review
export const summaryMarkerSchema = z.strictObject({
  head: z.string().regex(/^[0-9a-f]{40}$/u),
  reviews: z.int().positive(),
  reported: z.array(z.string()),
  failedCalls: z.int().nonnegative(),
  followUps: z.array(z.string()).default([]),
  confirmed: z.array(z.string()).default([]),
  reviewID: z.string().optional(),
});

export type SummaryMarker = z.infer<typeof summaryMarkerSchema>;
