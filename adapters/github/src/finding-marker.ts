import { criterionSchema, findingLensSchema, severitySchema } from '@noslop/contract';
import { z } from 'zod';

const foldedFindingSchema = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{16}$/u),
  title: z.string().min(1),
  path: z.string().min(1),
  startLine: z.int().positive(),
  line: z.int().positive(),
  riskClass: z.string().min(1).nullable(),
  writtenByChange: z.boolean(),
});

export type FoldedFinding = z.infer<typeof foldedFindingSchema>;

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

  folded: z.array(foldedFindingSchema).optional(),
});

export type FindingMarker = z.infer<typeof findingMarkerSchema>;
