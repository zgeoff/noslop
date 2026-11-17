import { z } from 'zod';

export const tokensSchema = z.strictObject({
  input: z.int().nonnegative(),
  cachedInput: z.int().nonnegative(),
  cacheWrite: z.int().nonnegative(),
  output: z.int().nonnegative(),
});

export type Tokens = z.infer<typeof tokensSchema>;
