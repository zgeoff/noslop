import { z } from 'zod';

export const depthSchema = z.enum(['light', 'standard', 'deep']);

export type Depth = z.infer<typeof depthSchema>;
