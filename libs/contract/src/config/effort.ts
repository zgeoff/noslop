import { z } from 'zod';

export const effortSchema = z.enum(['low', 'medium', 'high']);

export type Effort = z.infer<typeof effortSchema>;
