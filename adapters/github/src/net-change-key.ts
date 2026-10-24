import { z } from 'zod';

const patchIDSchema = z.string().regex(/^[0-9a-f]{16}$/u);
const filesSchema = z.record(z.string(), patchIDSchema);

export const netChangeKeySchema = z.union([
  z.strictObject({ files: filesSchema }),
  z.strictObject({ head: z.string().regex(/^[0-9a-f]{40}$/u) }),
]);

export type NetChangeKey = z.infer<typeof netChangeKeySchema>;
