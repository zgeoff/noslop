import { z } from 'zod';

// the latest review as the summary marker keeps it; `followUps` stops a later review filing an issue
// twice, `confirmed` holds each `<finding id>:<commit>` fix a re-review read, so a later delta keeps
// it, and `reviewIDs` holds every review counted, so a repost of any of them adds no review
export const summaryMarkerSchema = z.strictObject({
  head: buildShaSchema(),

  // the range the review covered and the files it left out, so an answer after it counts its read
  base: buildShaSchema().optional(),

  // the ranges of the reviews before it, newest first, so an answer that a later review passed by
  // still counts the review that read its commit
  earlier: z.array(buildReviewedRangeSchema()).optional(),
  reviews: z.int().positive(),
  reported: z.array(z.string()),
  failedCalls: z.int().nonnegative(),
  followUps: z.array(z.string()).default([]),
  confirmed: z.array(z.string()).default([]),
  notReviewed: z.array(z.string()).optional(),

  // the files the review read while some lenses' calls left them out, with those lenses
  notReviewedByLens: buildLensNotReviewedSchema().optional(),
  reviewIDs: z.array(z.string()).optional(),

  // when the review that wrote the summary started, so a retry of an earlier review leaves it alone
  startedAt: z.iso.datetime().optional(),
});

export type SummaryMarker = z.infer<typeof summaryMarkerSchema>;

function buildReviewedRangeSchema() {
  return z.strictObject({
    base: buildShaSchema(),
    head: buildShaSchema(),
    reported: z.array(z.string()),
    notReviewed: z.array(z.string()),
    notReviewedByLens: buildLensNotReviewedSchema().optional(),

    // a review with a failed call, whose range rejects the findings it reported and confirms no fix
    partial: z.boolean().optional(),
  });
}

// a lens is a plain string here, so a marker that names a lens a later version renames still parses
function buildLensNotReviewedSchema() {
  const file = z.strictObject({ path: z.string(), lenses: z.array(z.string()) });

  return z.array(file);
}

function buildShaSchema() {
  return z.string().regex(/^[0-9a-f]{40}$/u);
}
