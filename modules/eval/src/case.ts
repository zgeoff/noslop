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

// one past change: the repo, its base and the reviewed head, and what a reference reviewer found
// there, with each finding labelled by what happened to it
export const caseSchema = z.strictObject({
  id: z.string().min(1),
  repo: z.string().min(1),
  base: commitSchema,
  head: commitSchema,

  // the head an earlier review of the pull request covered; a case that names one is a re-review of
  // the push from it to the head, so it replays as an incremental review of that push alone, while
  // the base, the title and the body still describe the whole pull request
  reviewedHead: commitSchema.optional(),
  title: z.string(),
  body: z.string(),

  // the text of the issue the change closes, which the intent lens reads; a case without one runs
  // no intent lens
  linkedIssue: z.string().min(1).optional(),
  findings: z.array(labelledFindingSchema),
  escapes: z.array(escapeSchema),
  silences: z.array(silenceSchema).optional(),
});

export type Case = z.infer<typeof caseSchema>;
