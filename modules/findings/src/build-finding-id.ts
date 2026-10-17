import type { FindingLens } from '@noslop/contract';
import { normalizeTitle } from './normalize-title';

// a stable ID: the same defect found again at a moved line keeps its ID, because the hash leaves the
// line numbers out and reads the title in its normal form
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
