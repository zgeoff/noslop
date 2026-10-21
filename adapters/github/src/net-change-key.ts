import { z } from 'zod';

const patchIDSchema = z.string().regex(/^[0-9a-f]{16}$/u);
const filesSchema = z.record(z.string(), patchIDSchema);

// what a review read of a pull request: each changed file's patch id over the net change, from the
// merge base to the head, or the head itself when GitHub gives no whole file list
export const netChangeKeySchema = z.union([
  z.strictObject({ files: filesSchema }),
  z.strictObject({ head: z.string().regex(/^[0-9a-f]{40}$/u) }),
]);

export type NetChangeKey = z.infer<typeof netChangeKeySchema>;
