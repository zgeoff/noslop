import { expect, test } from 'bun:test';
import { mergeTokens } from './merge-tokens';

test('it adds up each count on its own', () => {
  expect(
    mergeTokens([
      { input: 100, cachedInput: 2000, cacheWrite: 40, output: 10 },
      { input: 5, cachedInput: 300, cacheWrite: 0, output: 1 },
    ]),
  ).toStrictEqual({ input: 105, cachedInput: 2300, cacheWrite: 40, output: 11 });
});

test('it gives zero counts for no parts', () => {
  expect(mergeTokens([])).toStrictEqual({ input: 0, cachedInput: 0, cacheWrite: 0, output: 0 });
});
