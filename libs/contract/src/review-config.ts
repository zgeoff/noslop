import { z } from 'zod';
import { effortSchema } from './effort';
import { lensIDSchema } from './lens-id';

// each key carries a description, which the generated JSON Schema of review.json shows in an editor
export const stackPatternSchema = z.strictObject({
  calls: z
    .array(z.string().min(1))
    .describe(
      'Call names that match: a bare name matches the last part of a call, a dotted name its tail, and a name that starts with `.` any call that ends with it',
    ),
  imports: z
    .array(z.string().min(1))
    .describe('Modules whose imports match: a call on a name imported from one matches'),
});

export type StackPattern = z.infer<typeof stackPatternSchema>;

export const riskClassSchema = z.strictObject({
  paths: z.array(z.string().min(1)).describe('Path globs that mark a change as in this class'),
  detectors: z
    .array(z.string().min(1))
    .describe(
      'Static-stage detectors that mark a change as in this class, such as `migration`, `deletion` or a security part',
    ),
  forces: z.array(lensIDSchema).describe('The lenses a change in this class always runs'),
});

export type RiskClass = z.infer<typeof riskClassSchema>;

export const lensOverrideSchema = z.strictObject({
  enabled: z
    .boolean()
    .optional()
    .describe('false turns the lens off, unless a marked risk class forces it on'),
  model: z.string().min(1).optional().describe('The model the lens runs on'),
  effort: effortSchema.optional().describe('The model effort, in place of the one the depth sets'),
  timeoutMs: z.int().positive().optional().describe('The time a call of this lens may take'),
});

export type LensOverride = z.infer<typeof lensOverrideSchema>;

export const thresholdsSchema = z.strictObject({
  lightMaxLines: z
    .int()
    .nonnegative()
    .describe('A change with more changed code lines than this is never Light'),
  lightMaxPackages: z
    .int()
    .positive()
    .describe('A change that touches more packages than this is never Light'),
  docsMinLines: z
    .int()
    .nonnegative()
    .describe('The changed prose lines that fire the documentation lens when no prose file is new'),
  complexityMin: z
    .int()
    .positive()
    .describe(
      'The complexity at which a function that does I/O fires the architecture-and-boundaries lens',
    ),
  deepMinPackages: z.int().positive().describe('A change that touches this many packages is Deep'),
  deepMinClassLines: z
    .int()
    .positive()
    .describe('A marked risk class makes a change Deep with this many changed lines in its paths'),
  deepMinForcedDeletions: z
    .int()
    .positive()
    .describe(
      'A change is Deep with this many deleted lines in the paths of risk classes that force lenses',
    ),
  commentDensityMax: z
    .int()
    .nonnegative()
    .describe(
      'Comment lines per thousand code lines above which the naming-shape-and-comments lens fires',
    ),
  concurrencyMinWrites: z
    .int()
    .positive()
    .describe('The writes in one change that fire the concurrency-and-data-integrity lens'),
  reuseShortlistSize: z
    .int()
    .positive()
    .describe('The most existing functions the reuse lens compares a new function with'),
  reuseMinScore: z
    .number()
    .min(0)
    .max(1)
    .describe('The similarity an existing function needs to reach the reuse shortlist'),
  mergeMinSharedWords: z
    .int()
    .positive()
    .describe(
      '2 findings on overlapping lines merge when every word of one title, and at least this many, is in the other title',
    ),
  parallelCalls: z.int().positive().describe('How many calls of one review run at once'),
  maxCallChars: z
    .int()
    .positive()
    .describe(
      'The most characters one call prompt may hold; a call over it splits by file into parts that fit',
    ),
  maxFileChars: z
    .int()
    .positive()
    .describe(
      'The most characters one file may add to a call prompt; a larger file is left out and listed as not reviewed',
    ),
  parallelCases: z.int().positive().describe('How many cases of one eval run at once'),
});

export type Thresholds = z.infer<typeof thresholdsSchema>;

export const consumerSchema = z.strictObject({
  repo: z.string().min(1).describe('The repo that consumes a package of this one, as owner/name'),
  path: z.string().min(1).describe('The file in that repo that pins the package'),
  pins: z.array(z.string().min(1)).describe('The package names that the file pins'),
});

export type Consumer = z.infer<typeof consumerSchema>;

export const adapterOptionsSchema = z.strictObject({
  timeoutMs: z.int().positive().optional().describe('The time one call may take'),
  model: z
    .string()
    .min(1)
    .optional()
    .describe('The model every call runs on, unless a lens names one'),
  mergeModel: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The model of the merge pass, a cheap one, since the pass only groups findings it reads',
    ),
});

export type AdapterOptions = z.infer<typeof adapterOptionsSchema>;

export const reporterOptionsSchema = z.strictObject({
  path: z.string().min(1).optional().describe('The file the reporter writes, such as the store'),
  url: z.url().optional().describe('The URL the webhook reporter posts the result to'),
  secretHeader: z
    .string()
    .min(1)
    .optional()
    .describe('The header the webhook reporter sends the secret in'),
  secretEnv: z
    .string()
    .min(1)
    .optional()
    .describe('The environment variable that holds the webhook secret'),
});

export type ReporterOptions = z.infer<typeof reporterOptionsSchema>;

const referenceGlobsSchema = z
  .array(z.string().min(1))
  .min(1)
  .describe('Path globs; the reference loads only for a change that touches a match');

export const rulesFileSchema = z.strictObject({
  path: z
    .string()
    .min(1)
    .describe(
      'The rules file, relative to the config that names it, or `repo:<path>` in the reviewed repo',
    ),
  label: z
    .string()
    .min(1)
    .optional()
    .describe('The name a finding cites the file by; the path as written unless given'),
  references: z
    .record(z.string().min(1), referenceGlobsSchema)
    .optional()
    .describe('Files beside the rules file, each one rule, by path, with the globs that load it'),
});

export type RulesFile = z.infer<typeof rulesFileSchema>;

// the merged config: every key holds a value once the built-in defaults sit under the repo's file
export const reviewConfigSchema = z.strictObject({
  rules: z
    .array(rulesFileSchema)
    .min(1)
    .nullable()
    .describe(
      'The rules files the taste lenses read, each one rule, whole; entries append across extends',
    ),
  adapter: z.string().min(1).nullable().describe('The model adapter: codex or claude'),
  adapters: z.record(z.string(), adapterOptionsSchema).describe('Options for each adapter, by id'),
  mergePass: z
    .strictObject({
      enabled: z.boolean().describe('Whether the merge pass runs'),
      effort: effortSchema.describe('The model effort of the merge pass'),
    })
    .describe('The one call after Assemble that groups the findings which report one defect'),
  designPass: z
    .strictObject({
      enabled: z.boolean().describe('Whether the design pass runs'),
      effort: effortSchema.describe('The model effort of the design pass'),
    })
    .describe(
      'The one call after the merge pass, on each review of a pull request after its first, that asks whether a better approach meets the task',
    ),
  riskClasses: z
    .record(z.string(), riskClassSchema)
    .describe('Named kinds of risky change, each marked by path globs or detectors'),
  stack: z
    .strictObject({
      writes: stackPatternSchema.describe('The calls that write to a store'),
      io: stackPatternSchema.describe('The calls that do I/O'),
      procedures: stackPatternSchema.describe('The calls that put code on the request path'),
      transactionHelper: stackPatternSchema.describe('The calls that open a transaction'),
      logger: stackPatternSchema.describe('The calls that log'),
      invariant: stackPatternSchema.describe('The calls that assert an invariant'),
      events: stackPatternSchema.describe('The calls that emit an event'),
    })
    .describe("The stack's patterns, which tell the static stage what each call does"),
  lenses: z
    .partialRecord(lensIDSchema, lensOverrideSchema)
    .describe('Overrides for each lens, by lens id'),

  // a lens that no call lists runs in a call of its own under the lens's name, so a call named
  // after a lens must list that lens, or the two calls would share one ID
  calls: z
    .record(z.string(), z.array(lensIDSchema))
    .superRefine((calls, ctx) => {
      for (const [callID, lenses] of Object.entries(calls)) {
        const lens = lensIDSchema.safeParse(callID);

        if (lens.success && !lenses.includes(lens.data)) {
          ctx.addIssue({
            code: 'custom',
            path: [callID],
            message: `the call ${callID} takes the name of the lens ${lens.data} but does not list it; list the lens in the call, or rename the call`,
          });
        }
      }
    })
    .describe('The grouping of lenses into model calls, by call id'),
  thresholds: thresholdsSchema.describe(
    'The limits that routing, depth and the static stage apply',
  ),
  consumers: z
    .array(consumerSchema)
    .describe('Files in other repos that pin a package of this repo'),
  generated: z
    .array(z.string().min(1))
    .describe('Path globs of generated files, lockfiles among them, which a review skips'),
  data: z
    .array(z.string().min(1))
    .describe(
      'Path globs of data files, such as corpora and fixtures, which a review leaves out and lists as not reviewed',
    ),
  instructions: z
    .array(z.string().min(1))
    .describe('Path globs of the instruction files an agent loads'),
  prose: z.array(z.string().min(1)).describe('Path globs of prose files'),
  infra: z.array(z.string().min(1)).describe('Path globs of files that deploy or provision'),
  synced: z
    .array(z.string().min(1))
    .describe('Path globs of copies that another repo syncs in, which a change must not edit'),
  breakingMarkers: z
    .array(z.string().min(1))
    .describe('Text in the pull request title or body that marks a breaking change'),
  limits: z
    .record(z.string(), z.number())
    .describe(
      'The published downstream maximum of each named input, which a schema bound must not pass',
    ),
  versionBump: z
    .array(z.string().min(1))
    .describe('Path globs whose change needs a version bump in the package that owns them'),
  report: z.array(z.string().min(1)).describe('The reporters a review runs, by id'),
  reporters: z
    .record(z.string(), reporterOptionsSchema)
    .describe('Options for each reporter, by id'),
});

export type ReviewConfig = z.infer<typeof reviewConfigSchema>;

export type StackPatternKind = keyof ReviewConfig['stack'];

// a review.json: every key is optional, and null removes the key it would inherit
export const reviewConfigFileSchema = z.looseObject({
  extends: z.string().min(1).optional(),
});

export type ReviewConfigFile = z.infer<typeof reviewConfigFileSchema>;
