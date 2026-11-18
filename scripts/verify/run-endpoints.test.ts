import { expect, test } from 'bun:test';
import { parseRunEndpoints } from './run-endpoints.ts';

test('it parses the paths and the branch prefix of a ready line', () => {
  const line = {
    event: 'ready',
    root: '/tmp/orchard/run',
    clone: '/tmp/orchard/run/clone',
    bunfig: '/tmp/orchard/run/empty-bunfig.toml',
    run: '0a1b2c3d',
  };

  expect(parseRunEndpoints(line)).toStrictEqual({
    root: '/tmp/orchard/run',
    clone: '/tmp/orchard/run/clone',
    bunfig: '/tmp/orchard/run/empty-bunfig.toml',
    run: '0a1b2c3d',
  });
});

test.each([
  { field: 'root', value: '' },
  { field: 'clone', value: '' },
  { field: 'bunfig', value: '' },
  { field: 'run', value: 'feature-x' },
])('it rejects a ready line whose $field is $value', (row) => {
  const line = {
    root: '/tmp/orchard/run',
    clone: '/tmp/orchard/run/clone',
    bunfig: '/tmp/orchard/run/empty-bunfig.toml',
    run: '0a1b2c3d',
    [row.field]: row.value,
  };

  expect(() => parseRunEndpoints(line)).toThrow();
});
