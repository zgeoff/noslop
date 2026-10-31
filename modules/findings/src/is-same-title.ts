import { normalizeTitle } from './normalize-title';
import { splitTitleWords } from './split-title-words';

export function isSameTitle(left: string, right: string, minSharedWords: number): boolean {
  if (normalizeTitle(left) === normalizeTitle(right)) {
    return true;
  }

  const leftWords = splitTitleWords(left);
  const rightWords = splitTitleWords(right);
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;

  return shared >= minSharedWords && shared === Math.min(leftWords.size, rightWords.size);
}
