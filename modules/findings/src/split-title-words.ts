import { normalizeTitle } from './normalize-title';

// the words a title's meaning rests on: no articles, prepositions, joining words or single letters,
// and a long word without its common ending, so `replaces` and `replacing` count as one word
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'so',
  'it',
  'its',
  'is',
  'be',
  'by',
  'at',
  'as',
  'with',
  'from',
  'into',
  'when',
  'that',
  'this',
  'than',
  'not',
  'no',
  'only',
  'instead',
  'before',
  'after',
  'each',
]);

export function splitTitleWords(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(' ')
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
      .map((word) => (word.length > 4 ? word.replace(/(?:ing|ed|es|s)$/u, '') : word)),
  );
}
