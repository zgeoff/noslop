import { expect, test } from 'bun:test';
import { buildMockFinding } from '@noslop/testing';
import { formatFindingComment } from './format-finding-comment';

test('it writes the severity, verdict, title, body, fact, fix, id and marker of a finding', () => {
  expect(
    formatFindingComment(
      buildMockFinding({
        verdict: 'PLAUSIBLE',
        unverifiedFact: 'Whether any caller passes an empty list.',
        fix: 'Start the loop at index 0.',
      }),
    ),
  ).toMatchInlineSnapshot(`
    "**P2 · PLAUSIBLE** Return the total of every item

    The loop skips the first item.

    **Unverified fact:** Whether any caller passes an empty list.

    **Fix:** Start the loop at index 0.

    noslop \`0123456789abcdef\` · correctness · wrong-behaviour-edge-path
    Reply with one of these as the first line: \`fixed <sha>\`, \`not-a-defect <reason>\`, \`deferred <issue>\` or \`accepted-risk <reason>\`.
    <!-- noslop:finding {"id":"0123456789abcdef","title":"Return the total of every item","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true} -->"
  `);
});
