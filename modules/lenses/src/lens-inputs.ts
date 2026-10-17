import type { LensID } from '@noslop/contract';
import type { FileKind, Slices } from '@noslop/static-stage';

export interface LensInput {
  // the kinds of changed file whose hunks the lens reads; an empty list reads no hunks
  hunks: readonly FileKind[];
  slices: readonly (keyof Slices)[];
  rules: boolean;
}

const CHANGED_CODE: readonly FileKind[] = ['code', 'test', 'config', 'infra', 'other'];

// what each lens reads beside its prompt section; a call joins the inputs of its lenses, and each
// slice appears once however many of them read it
export const LENS_INPUTS: Readonly<Record<LensID, LensInput>> = {
  correctness: { hunks: CHANGED_CODE, slices: ['functions'], rules: false },
  'failure-handling-and-observability': {
    hunks: CHANGED_CODE,
    slices: ['guards', 'throws'],
    rules: true,
  },
  'concurrency-and-data-integrity': {
    hunks: CHANGED_CODE,
    slices: ['writes', 'migrations', 'events'],
    rules: true,
  },
  security: { hunks: CHANGED_CODE, slices: ['security'], rules: false },
  'architecture-and-boundaries': {
    hunks: CHANGED_CODE,
    slices: ['functions', 'interfaces'],
    rules: true,
  },
  'naming-shape-and-comments': {
    hunks: CHANGED_CODE,
    slices: ['functions', 'comments'],
    rules: true,
  },
  'cross-repo-and-platform-limits': { hunks: CHANGED_CODE, slices: ['edges'], rules: false },
  'deploy-and-config': { hunks: CHANGED_CODE, slices: ['config'], rules: false },
  intent: { hunks: [...CHANGED_CODE, 'prose', 'instructions'], slices: [], rules: false },
  tests: { hunks: CHANGED_CODE, slices: ['tests'], rules: true },
  reuse: { hunks: [], slices: ['reuse'], rules: false },
  instructions: { hunks: ['instructions'], slices: ['instructions'], rules: false },
  documentation: { hunks: ['prose'], slices: ['prose'], rules: true },
};
