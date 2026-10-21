import { z } from 'zod';
import { severitySchema } from './severity';

// a finding is open until a fix call confirms its `fixed` answer, or until its latest answer is one
// of the other kinds
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

  // the login that wrote the latest answer, or null when no answer exists
  author: z.string().nullable(),
});

export type ListedFinding = z.infer<typeof listedFindingSchema>;

// the output of `noslop findings --json`: each finding posted on a pull request, with its state
export const findingListSchema = z.strictObject({ findings: z.array(listedFindingSchema) });

export type FindingList = z.infer<typeof findingListSchema>;
