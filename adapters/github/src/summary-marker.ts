import { z } from 'zod';

// the latest review as the summary marker keeps it; `followUps` stops a later review filing an issue
// twice, and `confirmed` holds each `<finding id>:<commit>` fix a re-review read, so a later delta
// that skips the file keeps it
export const summaryMarkerSchema = z.strictObject({
  head: z.string().regex(/^[0-9a-f]{40}$/u),
  reviews: z.int().positive(),
  reported: z.array(z.string()),
  failedCalls: z.int().nonnegative(),
  followUps: z.array(z.string()).default([]),
  confirmed: z.array(z.string()).default([]),
});

export type SummaryMarker = z.infer<typeof summaryMarkerSchema>;
