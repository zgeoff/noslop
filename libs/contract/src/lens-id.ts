import { z } from 'zod';

// the order is the grouping order of the default calls, so a call's prompt lists its sections in it
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
