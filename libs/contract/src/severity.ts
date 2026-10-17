import { z } from 'zod';

export const severitySchema = z.enum(['P1', 'P2', 'P3']);

export type Severity = z.infer<typeof severitySchema>;
