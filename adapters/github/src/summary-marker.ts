import { z } from 'zod';

// what the summary comment's marker keeps of the latest review: the head it reviewed, how many reviews
// ran on the pull request, the IDs of the findings it reported, how many of its calls failed, and the
// findings that went to follow-up issues, so a later review files none of them twice
export const summaryMarkerSchema = z.strictObject({
  head: z.string().regex(/^[0-9a-f]{40}$/u),
  reviews: z.int().positive(),
  reported: z.array(z.string()),
  failedCalls: z.int().nonnegative(),
  followUps: z.array(z.string()).default([]),
});

export type SummaryMarker = z.infer<typeof summaryMarkerSchema>;
