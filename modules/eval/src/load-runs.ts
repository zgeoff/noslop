import { criterionSchema, depthSchema, findingLensSchema, severitySchema } from '@noslop/contract';
import { z } from 'zod';
import type { CaseRun } from './types';

const anchorSchema = z.strictObject({
  path: z.string().min(1),
  startLine: z.int().positive(),
  endLine: z.int().positive(),
});

const reportedSchema = z.strictObject({
  lens: findingLensSchema.nullable(),
  title: z.string(),
  severity: severitySchema,
  anchor: anchorSchema,
  criterion: criterionSchema.optional(),
  rule: z.string().min(1).optional(),
});

// a run recorded before the cache counts holds none, and its input count holds the cached share
const tokensSchema = z.strictObject({
  input: z.int().nonnegative(),
  cachedInput: z.int().nonnegative().default(0),
  cacheWrite: z.int().nonnegative().default(0),
  output: z.int().nonnegative(),
});

const droppedSchema = z.strictObject({
  lens: z.string(),
  title: z.string(),
  reason: z.string(),
  rule: z.string().nullable(),
  ruleQuote: z.string().nullable(),
});

const caseRunSchema = z.strictObject({
  caseID: z.string().min(1),
  review: z.strictObject({
    findings: z.array(reportedSchema),
    failed: z.boolean(),
    tokens: tokensSchema,
    durationMs: z.number().nonnegative(),
    calls: z.int().nonnegative(),
    depth: depthSchema.nullable(),
    dropped: z.array(droppedSchema).optional(),
    failedLenses: z.array(findingLensSchema).optional(),
  }),
});

// reads a recorded run: the JSON list of case runs that an earlier eval run wrote
export async function loadRuns(path: string): Promise<CaseRun[]> {
  const raw: unknown = await Bun.file(path).json();

  return z.array(caseRunSchema).parse(raw);
}
