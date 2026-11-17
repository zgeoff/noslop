import { z } from 'zod';

export const dispositionKindSchema = z.enum(['fixed', 'not-a-defect', 'deferred', 'accepted-risk']);

export type DispositionKind = z.infer<typeof dispositionKindSchema>;

export const dispositionSchema = z
  .strictObject({
    findingID: z.string().regex(/^[0-9a-f]{16}$/u),
    kind: dispositionKindSchema,
    value: z.string(),
    author: z.string().min(1),
    authorIsOwner: z.boolean(),
    source: z.string().min(1),
    at: z.iso.datetime(),
  })
  .refine((disposition) => disposition.kind === 'fixed' || disposition.value !== '', {
    path: ['value'],
    message: 'only a `fixed` disposition may have no value',
  });

export type Disposition = z.infer<typeof dispositionSchema>;
