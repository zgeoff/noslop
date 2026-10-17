import { z } from 'zod';
import { effortSchema } from './effort';
import { lensIDSchema } from './lens-id';

export const stackPatternSchema = z.strictObject({
  calls: z.array(z.string().min(1)),
  imports: z.array(z.string().min(1)),
});

export type StackPattern = z.infer<typeof stackPatternSchema>;

export const riskClassSchema = z.strictObject({
  paths: z.array(z.string().min(1)),
  detectors: z.array(z.string().min(1)),
  forces: z.array(lensIDSchema),
});

export type RiskClass = z.infer<typeof riskClassSchema>;

export const lensOverrideSchema = z.strictObject({
  enabled: z.boolean().optional(),
  model: z.string().min(1).optional(),
  effort: effortSchema.optional(),
  timeoutMs: z.int().positive().optional(),
});

export type LensOverride = z.infer<typeof lensOverrideSchema>;

export const thresholdsSchema = z.strictObject({
  lightMaxLines: z.int().nonnegative(),
  docsMinLines: z.int().nonnegative(),
  complexityMin: z.int().positive(),
  deepMinPackages: z.int().positive(),
  gapSweepMinFiles: z.int().positive(),
  gapSweepMinLines: z.int().positive(),
  commentDensityMax: z.int().nonnegative(),
  concurrencyMinWrites: z.int().positive(),
  reuseShortlistSize: z.int().positive(),
  reuseMinScore: z.number().min(0).max(1),

  // how many calls of one review, and how many cases of one eval, run at once
  parallelCalls: z.int().positive(),
  parallelCases: z.int().positive(),
});

export type Thresholds = z.infer<typeof thresholdsSchema>;

export const consumerSchema = z.strictObject({
  repo: z.string().min(1),
  path: z.string().min(1),
  pins: z.array(z.string().min(1)),
});

export type Consumer = z.infer<typeof consumerSchema>;

export const adapterOptionsSchema = z.strictObject({
  timeoutMs: z.int().positive().optional(),
  model: z.string().min(1).optional(),
});

export type AdapterOptions = z.infer<typeof adapterOptionsSchema>;

export const reporterOptionsSchema = z.strictObject({
  path: z.string().min(1).optional(),
  url: z.url().optional(),
  secretHeader: z.string().min(1).optional(),
  secretEnv: z.string().min(1).optional(),
});

export type ReporterOptions = z.infer<typeof reporterOptionsSchema>;

// the merged config: every key holds a value once the built-in defaults sit under the repo's file
export const reviewConfigSchema = z.strictObject({
  rules: z.string().min(1).nullable(),
  adapter: z.string().min(1).nullable(),
  adapters: z.record(z.string(), adapterOptionsSchema),
  riskClasses: z.record(z.string(), riskClassSchema),
  stack: z.strictObject({
    writes: stackPatternSchema,
    io: stackPatternSchema,
    procedures: stackPatternSchema,
    transactionHelper: stackPatternSchema,
    logger: stackPatternSchema,
    invariant: stackPatternSchema,
    events: stackPatternSchema,
  }),
  lenses: z.partialRecord(lensIDSchema, lensOverrideSchema),
  calls: z.record(z.string(), z.array(lensIDSchema)),
  thresholds: thresholdsSchema,
  consumers: z.array(consumerSchema),
  generated: z.array(z.string().min(1)),
  instructions: z.array(z.string().min(1)),
  prose: z.array(z.string().min(1)),
  infra: z.array(z.string().min(1)),
  synced: z.array(z.string().min(1)),
  breakingMarkers: z.array(z.string().min(1)),

  // the published downstream maximum of each named input, which a schema bound must not pass
  limits: z.record(z.string(), z.number()),

  // the paths whose change needs a version bump in the package that owns them
  versionBump: z.array(z.string().min(1)),
  report: z.array(z.string().min(1)),
  reporters: z.record(z.string(), reporterOptionsSchema),
});

export type ReviewConfig = z.infer<typeof reviewConfigSchema>;

export type StackPatternKind = keyof ReviewConfig['stack'];

// a review.json: every key is optional, and null removes the key it would inherit
export const reviewConfigFileSchema = z.looseObject({
  extends: z.string().min(1).optional(),
});

export type ReviewConfigFile = z.infer<typeof reviewConfigFileSchema>;
