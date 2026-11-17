import { expect, test } from 'bun:test';
import { collectKeySources } from './collect-key-sources';

test.each<{
  name: string;
  sources: Record<string, string>;
  key: string;
  expected: string[];
}>([
  {
    name: 'the one file that sets the key whole',
    sources: { report: 'repo/review.json' },
    key: 'report',
    expected: ['repo/review.json'],
  },
  {
    name: 'the one file that sets its nested key',
    sources: { 'github.app': 'repo/review.json' },
    key: 'github',
    expected: ['repo/review.json'],
  },
  {
    name: 'each layer that sets one of its nested keys, in chain order',
    sources: {
      'mergePass.effort': 'repo/review.json',
      'mergePass.enabled': 'built-in',
      'designPass.effort': 'shared/review.json',
    },
    key: 'mergePass',
    expected: ['built-in', 'repo/review.json'],
  },
  {
    name: 'no source of another key that starts with its name',
    sources: { mergePassLimit: 'repo/review.json', 'mergePass.effort': 'built-in' },
    key: 'mergePass',
    expected: ['built-in'],
  },
  {
    name: 'built-in when no layer sets it',
    sources: { report: 'repo/review.json' },
    key: 'adapter',
    expected: ['built-in'],
  },
])('it collects $name', (row) => {
  expect(
    collectKeySources(row.sources, row.key, ['built-in', 'shared/review.json', 'repo/review.json']),
  ).toStrictEqual(row.expected);
});
