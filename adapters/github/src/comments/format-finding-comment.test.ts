import { expect, test } from 'bun:test';
import { buildMockFinding } from '@noslop/testing';
import { formatFindingComment } from './format-finding-comment';

test('it writes the heading, body, fact, fix, reply options, details and marker of a finding', () => {
  expect(
    formatFindingComment(
      buildMockFinding({
        lens: 'naming-shape-and-comments',
        verdict: 'PLAUSIBLE',
        unverifiedFact: 'Whether any caller passes an empty list.',
        fix: 'Start the loop at index 0.',
      }),
      'b'.repeat(40),
    ),
  ).toMatchInlineSnapshot(`
    "**P2 · Naming shape and comments** · Return the total of every item

    The loop skips the first item.

    **Not checked:** Whether any caller passes an empty list.

    **Fix:** Start the loop at index 0.

    <details><summary>Reply options</summary>

    Start your reply with one of: \`fixed\`, \`fixed <sha>\`, \`not-a-defect <reason>\`, \`deferred <issue>\`, \`accepted-risk <reason>\`.
    </details>
    <details><summary>Details</summary>

    Finding \`0123456789abcdef\` · lens naming-shape-and-comments · criterion wrong-behaviour-edge-path · rule none
    </details>
    <!-- noslop:finding {"id":"0123456789abcdef","title":"Return the total of every item","path":"src/a.ts","lens":"naming-shape-and-comments","severity":"P2","riskClass":null,"writtenByChange":true,"criterion":"wrong-behaviour-edge-path","rule":null,"head":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"} -->"
  `);
});

test('it leaves out the fact and the fix of a CONFIRMED finding without a fix', () => {
  expect(formatFindingComment(buildMockFinding(), 'b'.repeat(40))).toStartWith(
    [
      '**P2 · Correctness** · Return the total of every item',
      '',
      'The loop skips the first item.',
      '',
      '<details><summary>Reply options</summary>',
    ].join('\n'),
  );
});

test('it tells how to answer the findings of a folded comment one line each', () => {
  expect(
    formatFindingComment(buildMockFinding(), 'b'.repeat(40), [
      buildMockFinding({
        id: '2222222222222222',
        anchor: { path: 'src/b.ts', startLine: 4, endLine: 4 },
      }),
    ]),
  ).toInclude(
    'To answer the findings of this comment apart, start the reply with one line per finding: its id, a space, and one of those forms, as `0123456789abcdef fixed <sha>`.',
  );
});

test('it names the rule of a finding in its details', () => {
  expect(
    formatFindingComment(
      buildMockFinding({ criterion: 'taste-rule', rule: 'Name each retry' }),
      'b'.repeat(40),
    ),
  ).toInclude(
    'Finding `0123456789abcdef` · lens correctness · criterion taste-rule · rule Name each retry',
  );
});
