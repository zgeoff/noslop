import { expect, test } from 'bun:test';
import { splitTitleWords } from './split-title-words';

test('it keeps the words a title rests on, without joining words or common endings', () => {
  expect([
    ...splitTitleWords("Keep the transient watcher's interval when start replaces it"),
  ]).toStrictEqual(['keep', 'transient', 'watcher', 'interval', 'start', 'replac']);
});

test('it reads 2 forms of one verb as one word', () => {
  expect([...splitTitleWords('Stop replacing the unit')]).toStrictEqual([
    ...splitTitleWords('Stop replaces the unit'),
  ]);
});
