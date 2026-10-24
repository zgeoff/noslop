import { z } from 'zod';

export const followUpMarkerSchema = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{16}$/u),
  pullRequest: z.int().positive(),
});
