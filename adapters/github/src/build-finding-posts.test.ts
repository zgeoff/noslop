import { expect, test } from 'bun:test';
import { buildMockFinding } from '@noslop/testing';
import { buildFindingPosts } from './build-finding-posts';
import { formatFindingComment } from './format-finding-comment';

test('it posts each finding of a class of four alone', () => {
  const findings = [1, 2, 3, 4].map((line) =>
    buildMockFinding({
      id: `${line}`.repeat(16),
      anchor: { path: 'src/a.ts', startLine: line, endLine: line },
    }),
  );

  expect(buildFindingPosts(findings, 'b'.repeat(40))).toStrictEqual(
    findings.map((finding) => ({ lead: finding, folded: [] })),
  );
});

test('it folds a class of five findings into the post of the first', () => {
  const findings = [1, 2, 3, 4, 5].map((line) =>
    buildMockFinding({
      id: `${line}`.repeat(16),
      anchor: { path: 'src/a.ts', startLine: line, endLine: line },
    }),
  );

  expect(buildFindingPosts(findings, 'b'.repeat(40))).toStrictEqual(
    findings.slice(0, 1).map((lead) => ({ lead, folded: findings.slice(1) })),
  );
});

test('it counts titles that differ only by the file name they hold as one class', () => {
  const findings = ['a', 'b', 'c', 'd', 'e'].map((name) =>
    buildMockFinding({
      id: name.repeat(16),
      lens: 'static',
      criterion: 'intent-mismatch',
      title: `Format-only edit to ${name}.sh, outside the linked issue`,
      anchor: { path: `scripts/${name}.sh`, startLine: 1, endLine: 1 },
    }),
  );

  expect(buildFindingPosts(findings, 'b'.repeat(40))).toStrictEqual(
    findings.slice(0, 1).map((lead) => ({ lead, folded: findings.slice(1) })),
  );
});

test('it keeps findings of another lens, rule or title out of the class', () => {
  const findings = [
    buildMockFinding({ id: '1'.repeat(16) }),
    buildMockFinding({ id: '2'.repeat(16) }),
    buildMockFinding({ id: '3'.repeat(16), lens: 'tests' }),
    buildMockFinding({ id: '4'.repeat(16), rule: 'skills/code-style' }),
    buildMockFinding({ id: '5'.repeat(16), title: 'Close the consumer' }),
  ];

  expect(buildFindingPosts(findings, 'b'.repeat(40))).toStrictEqual(
    findings.map((finding) => ({ lead: finding, folded: [] })),
  );
});

test('it splits a class whose one comment would pass the body limit GitHub sets', () => {
  const findings = Array.from({ length: 1000 }, (_, index) =>
    buildMockFinding({
      id: (index + 1).toString(16).padStart(16, '0'),
      anchor: { path: 'src/a.ts', startLine: index + 1, endLine: index + 1 },
    }),
  );

  const posts = buildFindingPosts(findings, 'b'.repeat(40));

  const lengths = posts.map(
    (post) => formatFindingComment(post.lead, 'b'.repeat(40), post.folded).length,
  );

  expect(posts.length).toBeGreaterThan(1);
  expect(lengths).toSatisfyAll((length: number) => length <= 65_536);
  expect(posts.flatMap((post) => post.folded.toSpliced(0, 0, post.lead))).toStrictEqual(findings);
});
