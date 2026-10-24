import { z } from 'zod';
import { severitySchema } from './severity';

export const findingStateSchema = z.enum([
  'open',
  'fixed',
  'not-a-defect',
  'deferred',
  'accepted-risk',
]);

export type FindingState = z.infer<typeof findingStateSchema>;

export const listedFindingSchema = z.strictObject({
  id: z.string(),
  path: z.string(),
  severity: severitySchema,
  state: findingStateSchema,
  author: z.string().nullable(),
  reason: z.string().nullable(),
});

export type ListedFinding = z.infer<typeof listedFindingSchema>;

export const findingListSchema = z.strictObject({ findings: z.array(listedFindingSchema) });

export type FindingList = z.infer<typeof findingListSchema>;
