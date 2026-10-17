import type { DispositionKind } from '@noslop/contract';
import { dispositionKindSchema } from '@noslop/contract';

export interface ParsedDisposition {
  kind: DispositionKind;
  value: string;
}

// the first line of a reply as a typed disposition: the kind, a space, then its value; any other first
// line, free text included, is no disposition
export function parseDisposition(reply: string): ParsedDisposition | null {
  const firstLine = reply.trim().split('\n', 1)[0]?.trim() ?? '';
  const match = /^(?<kind>\S+)\s+(?<value>.+)$/u.exec(firstLine);
  const kind = dispositionKindSchema.safeParse(match?.groups?.['kind']);
  const value = match?.groups?.['value']?.trim() ?? '';

  if (!kind.success || value === '') {
    return null;
  }

  if (kind.data === 'fixed' && !/^[0-9a-f]{7,40}$/u.test(value)) {
    return null;
  }

  return { kind: kind.data, value };
}
