import { z } from 'zod';
import { CRITERION_SEVERITY, criterionSchema } from './criterion';
import { callLensSchema } from './lens-id';
import { severitySchema } from './severity';
import { verdictSchema } from './verdict';

export const ANCHOR_MAX_LINES = 10;
export const TITLE_MAX_LENGTH = 80;

export const anchorSchema = z
  .strictObject({
    path: z.string().min(1),
    startLine: z.int().positive(),
    endLine: z.int().positive(),
  })
  .refine((anchor) => anchor.endLine >= anchor.startLine, {
    message: 'endLine is before startLine',
    path: ['endLine'],
  })
  .refine((anchor) => anchor.endLine - anchor.startLine < ANCHOR_MAX_LINES, {
    message: `an anchor spans at most ${ANCHOR_MAX_LINES} lines`,
    path: ['endLine'],
  });

export type Anchor = z.infer<typeof anchorSchema>;

export const secondLocationSchema = z.strictObject({
  repo: z.string().min(1),
  commit: z.string().regex(/^[0-9a-f]{7,40}$/u),
  path: z.string().min(1),
  startLine: z.int().positive(),
  endLine: z.int().positive(),
});

export type SecondLocation = z.infer<typeof secondLocationSchema>;

export const findingLensSchema = z.union([callLensSchema, z.literal('static')]);

export type FindingLens = z.infer<typeof findingLensSchema>;

export const findingSchema = z
  .strictObject({
    id: z.string().regex(/^[0-9a-f]{16}$/u),
    lens: findingLensSchema,

    // the call in the review result that reported it, so the store records its depth, model and
    // effort; null for a direct finding of the static stage
    callID: z.string().min(1).nullable(),
    title: z.string().min(1).max(TITLE_MAX_LENGTH),
    body: z.string().min(1),
    anchor: anchorSchema,
    secondLocation: secondLocationSchema.optional(),
    severity: severitySchema,
    criterion: criterionSchema,
    rule: z.string().min(1).optional(),
    verdict: verdictSchema,
    unverifiedFact: z.string().min(1).optional(),
    writtenByChange: z.boolean(),

    // the marked risk class whose paths hold the anchor; a risk-class finding blocks the merge even in
    // code the change did not write
    riskClass: z.string().min(1).optional(),
    fix: z.string().min(1).optional(),
  })
  .refine((finding) => finding.verdict === 'CONFIRMED' || finding.unverifiedFact !== undefined, {
    message: 'a PLAUSIBLE finding holds the fact its lens could not read',
    path: ['unverifiedFact'],
  })
  .refine((finding) => finding.severity === CRITERION_SEVERITY[finding.criterion], {
    message: 'the severity is the one its criterion sets',
    path: ['severity'],
  });

export type Finding = z.infer<typeof findingSchema>;
