import { expect, test } from 'bun:test';

test('it rejects a request that no handler matches', () => {
  expect(fetch('https://unmatched.test/notes')).rejects.toThrow(
    /Cannot bypass a request when using the "error" strategy/u,
  );
});
