import { criterionSchema, findingLensSchema, severitySchema } from '@noslop/contract';
import { z } from 'zod';

export const findingMarkerSchema = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{16}$/u),
  title: z.string().min(1),
  path: z.string().min(1),
  lens: findingLensSchema,
  severity: severitySchema,
  riskClass: z.string().min(1).nullable(),
  writtenByChange: z.boolean(),

  criterion: criterionSchema.optional(),
  rule: z.string().min(1).nullable().optional(),

  head: z
    .string()
    .regex(/^[0-9a-f]{40}$/u)
    .optional(),
});

export type FindingMarker = z.infer<typeof findingMarkerSchema>;
