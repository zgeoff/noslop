import { findingLensSchema, lensIDSchema, severitySchema } from '@noslop/contract';
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

export const silenceSchema = z.strictObject({
  lens: findingLensSchema,
  anchor: labelledFindingSchema.shape.anchor.optional(),
  reason: z.string().min(1),
});

export type Silence = z.infer<typeof silenceSchema>;

export const caseFixSchema = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{16}$/u),
  title: z.string().min(1),
  lens: findingLensSchema,
  path: z.string().min(1),
  line: z.int().positive().nullable(),
  comment: z.string(),
  postedHead: commitSchema.nullable(),
  commit: z.string().min(1).nullable(),
  expected: z.enum(['fixed', 'not-fixed']),
});

export type CaseFix = z.infer<typeof caseFixSchema>;

export const caseSchema = z.strictObject({
  id: z.string().min(1),
  repo: z.string().min(1),
  base: commitSchema,
  head: commitSchema,

  reviewedHead: commitSchema.optional(),
  title: z.string(),
  body: z.string(),

  linkedIssue: z.string().min(1).optional(),
  findings: z.array(labelledFindingSchema),
  escapes: z.array(escapeSchema),
  silences: z.array(silenceSchema).optional(),

  fixes: z.array(caseFixSchema).optional(),
});

export type Case = z.infer<typeof caseSchema>;
