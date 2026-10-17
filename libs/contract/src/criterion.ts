import { z } from 'zod';
import type { Severity } from './severity';

// each criterion is one row of the severity table, so a finding's severity follows from the criterion
// its lens names
export const criterionSchema = z.enum([
  'security-defect',
  'data-loss',
  'outage',
  'wrong-result-main-path',
  'wrong-behaviour-edge-path',
  'untested-change',
  'taste-rule',
  'misleading-name',
  'intent-mismatch',
  'duplicate-helper',
  'instruction-conflict',
  'wrong-doc-fact',
  'naming',
  'comments',
  'documentation-prose',
  'noisy-log',
]);

export type Criterion = z.infer<typeof criterionSchema>;

export const CRITERION_SEVERITY: Readonly<Record<Criterion, Severity>> = {
  'security-defect': 'P1',
  'data-loss': 'P1',
  outage: 'P1',
  'wrong-result-main-path': 'P1',
  'wrong-behaviour-edge-path': 'P2',
  'untested-change': 'P2',
  'taste-rule': 'P2',
  'misleading-name': 'P2',
  'intent-mismatch': 'P2',
  'duplicate-helper': 'P2',
  'instruction-conflict': 'P2',
  'wrong-doc-fact': 'P2',
  naming: 'P3',
  comments: 'P3',
  'documentation-prose': 'P3',
  'noisy-log': 'P3',
};
