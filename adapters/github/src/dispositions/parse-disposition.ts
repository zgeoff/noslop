import type { DispositionKind } from '@noslop/contract';
import { dispositionKindSchema } from '@noslop/contract';

export interface ParsedDisposition {
  kind: DispositionKind;
  value: string;
}

export function parseDisposition(reply: string): ParsedDisposition | null {
  const firstLine = reply.trim().split('\n', 1)[0]?.trim() ?? '';

  if (firstLine === 'fixed') {
    return { kind: 'fixed', value: '' };
  }

  const match = /^(?<kind>\S+)\s+(?<value>.+)$/u.exec(firstLine);
  const kind = dispositionKindSchema.safeParse(match?.groups?.['kind']);
  const value = match?.groups?.['value']?.trim() ?? '';

  if (!kind.success || value === '') {
    return null;
  }

  if (kind.data === 'fixed') {
    return parseFixedSha(value);
  }

  return { kind: kind.data, value };
}

function parseFixedSha(value: string): ParsedDisposition | null {
  const sha = /^(?<sha>[0-9a-f]{7,40})(?!\w)/u.exec(value)?.groups?.['sha'];

  if (sha === undefined) {
    return null;
  }

  return { kind: 'fixed', value: sha };
}
