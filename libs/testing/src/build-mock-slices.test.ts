import { expect, test } from 'bun:test';
import { buildMockSlices } from './build-mock-slices';

test('it builds default slices', () => {
  expect(buildMockSlices()).toStrictEqual({
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
    scripts: [],
    interfaces: [],
    migrations: [],
    events: [],
    comments: { commentLines: 0, codeLines: 0, perThousand: 0, target: 120 },
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockSlices({ migrations: ['db/migrations/1.sql'], comments: { perThousand: 300 } }),
  ).toMatchObject({
    migrations: ['db/migrations/1.sql'],
    comments: { commentLines: 0, codeLines: 0, perThousand: 300, target: 120 },
  });
});
