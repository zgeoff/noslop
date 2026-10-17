import { z } from 'zod';
import { criterionSchema } from './criterion';
import { lensIDSchema } from './lens-id';
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

export const findingLensSchema = z.union([lensIDSchema, z.literal('static')]);

export type FindingLens = z.infer<typeof findingLensSchema>;

export const findingSchema = z
  .strictObject({
    id: z.string().regex(/^[0-9a-f]{16}$/u),
    lens: findingLensSchema,
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
    fix: z.string().min(1).optional(),
  })
  .refine((finding) => finding.verdict === 'CONFIRMED' || finding.unverifiedFact !== undefined, {
    message: 'a PLAUSIBLE finding holds the fact its lens could not read',
    path: ['unverifiedFact'],
  });

export type Finding = z.infer<typeof findingSchema>;
