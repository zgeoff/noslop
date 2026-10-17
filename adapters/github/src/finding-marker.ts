import { findingLensSchema, severitySchema } from '@noslop/contract';
import { z } from 'zod';

// what the finding comment's marker keeps of the finding: enough to judge a disposition and to list an
// unanswered finding in the check run, without the review result that posted it
export const findingMarkerSchema = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{16}$/u),
  title: z.string().min(1),
  lens: findingLensSchema,
  severity: severitySchema,
  riskClass: z.string().min(1).nullable(),
  writtenByChange: z.boolean(),
});

export type FindingMarker = z.infer<typeof findingMarkerSchema>;
