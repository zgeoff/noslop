import { expect, test } from 'bun:test';
import type { FixVerdict } from './pick-fix-verdict';
import { pickFixVerdict } from './pick-fix-verdict';

test.each<[string, FixVerdict[], FixVerdict]>([
  ['a newer rejection over an older confirmation', ['none', 'rejected', 'confirmed'], 'rejected'],
  ['a newer confirmation over an older rejection', ['confirmed', 'rejected'], 'confirmed'],
  ['the newest verdict past silent reviews', ['none', 'none', 'confirmed'], 'confirmed'],
  ['no verdict from silent reviews', ['none', 'none'], 'none'],
  ['no verdict from no reviews', [], 'none'],
])('it picks %s', (_label, verdicts, expected) => {
  expect(pickFixVerdict(verdicts)).toBe(expected);
});
