import { z } from 'zod';

export const dispositionKindSchema = z.enum(['fixed', 'not-a-defect', 'deferred', 'accepted-risk']);

export type DispositionKind = z.infer<typeof dispositionKindSchema>;

// the first line of the author's reply in a finding's thread, parsed; `value` holds the commit for
// `fixed`, the issue for `deferred`, and the reason for the other 2 kinds
export const dispositionSchema = z.strictObject({
  findingID: z.string().regex(/^[0-9a-f]{16}$/u),
  kind: dispositionKindSchema,
  value: z.string().min(1),
  author: z.string().min(1),
  authorIsOwner: z.boolean(),
  source: z.string().min(1),
  at: z.iso.datetime(),
});

export type Disposition = z.infer<typeof dispositionSchema>;
