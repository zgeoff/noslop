import { expect, test } from 'bun:test';
import { buildTokensFromCodexUsage } from './build-tokens-from-codex-usage';

test('it keeps the cache writes inside the new input', () => {
  expect(
    buildTokensFromCodexUsage({
      input_tokens: 1000,
      cached_input_tokens: 600,
      cache_write_input_tokens: 300,
      output_tokens: 20,
    }),
  ).toStrictEqual({ input: 400, cachedInput: 600, cacheWrite: 300, output: 20 });
});

test('it counts no new input when the cached share exceeds the input', () => {
  expect(
    buildTokensFromCodexUsage({
      input_tokens: 100,
      cached_input_tokens: 120,
      cache_write_input_tokens: 0,
      output_tokens: 3,
    }),
  ).toStrictEqual({ input: 0, cachedInput: 120, cacheWrite: 0, output: 3 });
});
