import { z } from 'zod';

// what one call or one review spent, in the provider's prompt cache terms: new input is every input
// token the provider did not read from its cache, the tokens it wrote to the cache included; cache
// writes are the part of new input that the provider wrote to its cache
export const tokensSchema = z.strictObject({
  input: z.int().nonnegative(),
  cachedInput: z.int().nonnegative(),
  cacheWrite: z.int().nonnegative(),
  output: z.int().nonnegative(),
});

export type Tokens = z.infer<typeof tokensSchema>;
