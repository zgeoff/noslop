import { lensIDSchema, severitySchema } from '@noslop/contract';
import { z } from 'zod';

const commitSchema = z.string().regex(/^[0-9a-f]{40}$/u);

export const labelSchema = z.enum(['true-positive', 'false-positive', 'disputed']);

export type Label = z.infer<typeof labelSchema>;

export const labelledFindingSchema = z.strictObject({
  anchor: z.strictObject({
    path: z.string().min(1),
    startLine: z.int().positive(),
    endLine: z.int().positive(),
  }),
  title: z.string().min(1),
  severity: severitySchema,
  lens: lensIDSchema.nullable(),
  label: labelSchema,
});

export type LabelledFinding = z.infer<typeof labelledFindingSchema>;

export const escapeSchema = z.strictObject({
  defect: z.string().min(1),
  anchor: labelledFindingSchema.shape.anchor.optional(),
  lens: lensIDSchema.nullable().optional(),
  visibleInDiff: z.boolean(),
});

export type Escape = z.infer<typeof escapeSchema>;

// one past change: the repo, its base and the reviewed head, and what a reference reviewer found
// there, with each finding labelled by what happened to it
export const caseSchema = z.strictObject({
  id: z.string().min(1),
  repo: z.string().min(1),
  base: commitSchema,
  head: commitSchema,
  title: z.string(),
  body: z.string(),
  findings: z.array(labelledFindingSchema),
  escapes: z.array(escapeSchema),
});

export type Case = z.infer<typeof caseSchema>;
