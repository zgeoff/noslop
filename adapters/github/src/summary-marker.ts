import { z } from 'zod';

// what the summary comment's marker keeps of the latest review: the head it reviewed, how many reviews
// ran on the pull request, the IDs of the findings it reported, and how many of its calls failed
export const summaryMarkerSchema = z.strictObject({
  head: z.string().regex(/^[0-9a-f]{40}$/u),
  reviews: z.int().positive(),
  reported: z.array(z.string()),
  failedCalls: z.int().nonnegative(),
});

export type SummaryMarker = z.infer<typeof summaryMarkerSchema>;
