import { criterionSchema, findingLensSchema, severitySchema } from '@noslop/contract';
import { z } from 'zod';

// what the finding comment's marker keeps of the finding: enough to judge a disposition and to list an
// unanswered finding in the check run, without the review result that posted it
export const findingMarkerSchema = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{16}$/u),
  title: z.string().min(1),
  path: z.string().min(1),
  lens: findingLensSchema,
  severity: severitySchema,
  riskClass: z.string().min(1).nullable(),
  writtenByChange: z.boolean(),

  // the criterion and the rule the finding cites, so a later review matches a new finding to it; a
  // marker posted before the fields holds neither
  criterion: criterionSchema.optional(),
  rule: z.string().min(1).nullable().optional(),

  // the head of the review that posted the finding, which a fix call traces the finding's line from;
  // a marker posted before the field holds none
  head: z
    .string()
    .regex(/^[0-9a-f]{40}$/u)
    .optional(),
});

export type FindingMarker = z.infer<typeof findingMarkerSchema>;
