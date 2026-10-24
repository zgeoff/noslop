import type { FindingLens } from '@noslop/contract';
import { normalizeTitle } from './normalize-title';

export function buildFindingID(
  lens: FindingLens,
  path: string,
  ruleOrCriterion: string,
  title: string,
): string {
  return new Bun.CryptoHasher('sha256')
    .update([lens, path, ruleOrCriterion, normalizeTitle(title)].join('\n'))
    .digest('hex')
    .slice(0, 16);
}
