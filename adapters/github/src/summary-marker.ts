import { z } from 'zod';

// the latest review as the summary marker keeps it; `followUps` stops a later review filing an issue
// twice, `confirmed` holds each `<finding id>:<commit>` fix a re-review read, so a later delta keeps
// it, and `reviewIDs` holds every review counted, so a repost of any of them adds no review
export const summaryMarkerSchema = z.strictObject({
  head: z.string().regex(/^[0-9a-f]{40}$/u),
  reviews: z.int().positive(),
  reported: z.array(z.string()),
  failedCalls: z.int().nonnegative(),
  followUps: z.array(z.string()).default([]),
  confirmed: z.array(z.string()).default([]),
  rewritten: z.array(buildRewrittenFixSchema()).optional(),
  reviewIDs: z.array(z.string()).optional(),
});

export type SummaryMarker = z.infer<typeof summaryMarkerSchema>;

// a fix commit a rebase rewrote, per finding, since each finding checks the commit against the head
// that posted it; the check reads the branch commit that holds the change
function buildRewrittenFixSchema() {
  return z.strictObject({
    id: z.string(),
    named: z.string(),
    branch: z.string().regex(/^[0-9a-f]{40}$/u),
  });
}
