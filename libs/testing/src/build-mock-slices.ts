import type { CommentDensity, Slices } from '@noslop/contract';

export type SlicesOverrides = Partial<Omit<Slices, 'comments'>> & {
  comments?: Partial<CommentDensity>;
};

// empty slices, as the static stage gives a change it finds nothing in; routing is deterministic, so
// every default is fixed
export function buildMockSlices(overrides: SlicesOverrides = {}): Slices {
  return {
    functions: [],
    reuse: [],
    guards: [],
    throws: [],
    writes: [],
    security: [],
    edges: [],
    config: [],
    tests: [],
    instructions: [],
    prose: [],
    typeClaims: [],
    interfaces: [],
    migrations: [],
    events: [],
    ...overrides,
    comments: { commentLines: 0, codeLines: 0, perThousand: 0, target: 120, ...overrides.comments },
  };
}
