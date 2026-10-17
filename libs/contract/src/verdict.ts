import { z } from 'zod';

export const verdictSchema = z.enum(['CONFIRMED', 'PLAUSIBLE']);

export type Verdict = z.infer<typeof verdictSchema>;
