import { expect, test } from 'bun:test';
import { pickAnswerPosts } from './pick-answer-posts.ts';

test('it answers the thread with the lowest comment ID first', () => {
  const threads = [
    { source: 'review' as const, commentID: 30, marker: { id: 'aaaaaaaaaaaaaaaa' } },
    { source: 'review' as const, commentID: 12, marker: { id: 'bbbbbbbbbbbbbbbb' } },
  ];

  expect(pickAnswerPosts(threads, 'first', 'fixed 4f2a9c1')).toStrictEqual({
    kind: 'posts',
    posts: [{ kind: 'review-reply', commentID: 12, body: 'fixed 4f2a9c1' }],
  });
});

test('it answers every thread but the first in comment ID order', () => {
  const threads = [
    { source: 'review' as const, commentID: 30, marker: { id: 'aaaaaaaaaaaaaaaa' } },
    { source: 'review' as const, commentID: 12, marker: { id: 'bbbbbbbbbbbbbbbb' } },
    { source: 'review' as const, commentID: 21, marker: { id: 'cccccccccccccccc' } },
  ];

  expect(pickAnswerPosts(threads, 'all-but-first', 'not-a-defect bound')).toStrictEqual({
    kind: 'posts',
    posts: [
      { kind: 'review-reply', commentID: 21, body: 'not-a-defect bound' },
      { kind: 'review-reply', commentID: 30, body: 'not-a-defect bound' },
    ],
  });
});

test('it answers each finding of an issue thread on a line of one comment', () => {
  const threads = [
    {
      source: 'issue' as const,
      commentID: 7,
      marker: { id: 'aaaaaaaaaaaaaaaa', folded: [{ id: 'dddddddddddddddd' }] },
    },
  ];

  expect(pickAnswerPosts(threads, 'first', 'fixed 4f2a9c1')).toStrictEqual({
    kind: 'posts',
    posts: [
      {
        kind: 'issue-comment',
        body: 'aaaaaaaaaaaaaaaa fixed 4f2a9c1\ndddddddddddddddd fixed 4f2a9c1',
      },
    ],
  });
});

test('it finds nothing to answer first on a pull request with no thread', () => {
  expect(pickAnswerPosts([], 'first', 'fixed 4f2a9c1')).toStrictEqual({ kind: 'none-to-answer' });
});

test('it answers no thread but the first on a pull request with one thread', () => {
  const threads = [
    { source: 'review' as const, commentID: 12, marker: { id: 'bbbbbbbbbbbbbbbb' } },
  ];

  expect(pickAnswerPosts(threads, 'all-but-first', 'not-a-defect bound')).toStrictEqual({
    kind: 'posts',
    posts: [],
  });
});
