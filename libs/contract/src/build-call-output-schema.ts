import { z } from 'zod';
import { criterionSchema } from './criterion';
import type { LensID } from './lens-id';
import { severitySchema } from './severity';
import { verdictSchema } from './verdict';

// a model CLI's structured output needs every key present, so an absent value is null; the anchor
// rules stay out of the schema because a bad anchor drops one finding in Assemble, not the whole call
export const modelFindingSchema = z.strictObject({
  title: z.string(),
  body: z.string(),
  anchor: z.strictObject({ path: z.string(), startLine: z.int(), endLine: z.int() }),
  secondLocation: z
    .strictObject({
      repo: z.string(),
      commit: z.string(),
      path: z.string(),
      startLine: z.int(),
      endLine: z.int(),
    })
    .nullable(),
  severity: severitySchema,
  criterion: criterionSchema,
  rule: z.string().nullable(),
  verdict: verdictSchema,
  unverifiedFact: z.string().nullable(),
  missingChange: z.boolean(),
  fix: z.string().nullable(),
});

export type ModelFinding = z.infer<typeof modelFindingSchema>;

export interface CallOutput {
  findings: Partial<Record<LensID, ModelFinding[]>>;
}

// one findings list per fired lens, keyed by lens ID, so every finding keeps its lens
export function buildCallOutputSchema(lenses: readonly LensID[]): z.ZodType<CallOutput> {
  const shape = Object.fromEntries(lenses.map((lens) => [lens, z.array(modelFindingSchema)]));

  return z.strictObject({ findings: z.strictObject(shape) });
}

// the JSON Schema of a call's output that an adapter passes to its CLI's schema flag, as plain JSON;
// it names no draft, because Claude Code's validator refuses the 2020-12 meta-schema that zod names
export function buildOutputJSONSchema(schema: z.ZodType): Record<string, unknown> {
  const { '~standard': _standard, $schema: _draft, ...jsonSchema } = z.toJSONSchema(schema);

  return jsonSchema;
}
