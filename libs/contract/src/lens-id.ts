import { z } from 'zod';

export const LENS_IDS = [
  'correctness',
  'failure-handling-and-observability',
  'concurrency-and-data-integrity',
  'security',
  'architecture-and-boundaries',
  'naming-shape-and-comments',
  'cross-repo-and-platform-limits',
  'deploy-and-config',
  'intent',
  'tests',
  'reuse',
  'instructions',
  'documentation',
] as const;

export const lensIDSchema = z.enum(LENS_IDS);

export type LensID = z.infer<typeof lensIDSchema>;

export const callLensSchema = z.union([lensIDSchema, z.literal('design')]);

export type CallLens = z.infer<typeof callLensSchema>;
