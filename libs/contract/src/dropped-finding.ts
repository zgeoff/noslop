import { z } from 'zod';
import { criterionSchema } from './criterion';
import { findingLensSchema } from './finding';

export const dropReasonSchema = z.enum([
  'anchor-outside-diff',
  'outside-diff-without-location',
  'unknown-rule',
  'plausible-without-fact',
  'invalid',
  'answered-not-a-defect',
]);

export type DropReason = z.infer<typeof dropReasonSchema>;

// a finding that Assemble dropped, as the call gave it, with the reason, so a store can tell a real
// finding that a rule threw away from an invented one; the anchor is the model's, unchecked
export const droppedFindingSchema = z.strictObject({
  lens: findingLensSchema,
  callID: z.string().min(1).nullable(),
  title: z.string(),
  anchor: z.strictObject({ path: z.string(), startLine: z.int(), endLine: z.int() }),
  criterion: criterionSchema,
  reason: dropReasonSchema,
  rule: z.string().nullable(),
  ruleQuote: z.string().nullable(),
});

export type DroppedFinding = z.infer<typeof droppedFindingSchema>;
