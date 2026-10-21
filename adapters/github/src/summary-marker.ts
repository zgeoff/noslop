import { z } from 'zod';
import { netChangeKeySchema } from './net-change-key';

// the latest review as the summary marker keeps it; `followUps` stops a later review filing an issue
// twice, `confirmed` holds each `<finding id>:<commit>` fix a fix call judged fixed, and `reviewIDs`
// holds every review counted, so a repost of any of them adds no review
export const summaryMarkerSchema = z.strictObject({
  head: buildShaSchema(),

  // the net change the reviews read, which a later head with the same net change keeps; a marker with
  // none counts only for its own head
  key: netChangeKeySchema.optional(),

  // a marker that an earlier version wrote may hold these ranges, which nothing reads; the schema
  // rejects an unknown key, so it keeps them to parse such a marker
  base: z.unknown().optional(),
  earlier: z.unknown().optional(),
  notReviewed: z.unknown().optional(),
  notReviewedByLens: z.unknown().optional(),
  reviews: z.int().positive(),
  reported: z.array(z.string()),
  failedCalls: z.int().nonnegative(),
  followUps: z.array(z.string()).default([]),
  confirmed: z.array(z.string()).default([]),

  // on a fixes-only run, the findings whose fix its calls judged fixed; a lens review keeps none
  checked: z.array(z.string()).optional(),

  // the head of the latest lens review with no failed call, which a fixes-only run carries and a
  // lens review with a failed call drops
  lensHead: buildShaSchema().optional(),

  // each merge commit whose resolution a fixes-only run judged sound, the ones earlier summaries held
  // among them, so a reader that counts the commits since the last lens review can count each such
  // merge as checked
  checkedMerges: z.array(buildShaSchema()).optional(),

  // each merge whose resolution a fixes-only run since the last lens review judged not sound with no
  // finding to carry the verdict, which fails the check
  rejectedMerges: z.array(buildShaSchema()).optional(),
  reviewIDs: z.array(z.string()).optional(),

  // when the review that wrote the summary started, so a retry of an earlier review leaves it alone
  startedAt: z.iso.datetime().optional(),
});

function buildShaSchema() {
  return z.string().regex(/^[0-9a-f]{40}$/u);
}

export type SummaryMarker = z.infer<typeof summaryMarkerSchema>;
