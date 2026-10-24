import type { Tokens } from '@noslop/contract';
import { z } from 'zod';

export const codexUsageSchema = z.looseObject({
  input_tokens: z.int(),
  cached_input_tokens: z.int(),

  // A Codex CLI older than the cache write count leaves it out.
  cache_write_input_tokens: z.int().default(0),
  output_tokens: z.int(),
});

// Codex counts the cached share inside its input count and takes it out to get the new input, so
// the cache writes stay inside the new input too
export function buildTokensFromCodexUsage(usage: z.infer<typeof codexUsageSchema>): Tokens {
  return {
    input: Math.max(usage.input_tokens - usage.cached_input_tokens, 0),
    cachedInput: usage.cached_input_tokens,
    cacheWrite: usage.cache_write_input_tokens,
    output: usage.output_tokens,
  };
}
