import { expect, test } from 'bun:test';
import { formatFixedFindingComment } from './format-fixed-finding-comment';

test('it strikes the heading, names the fix commit and collapses the posted comment above its marker', () => {
  expect(
    formatFixedFindingComment(
      [
        '**P2 · Correctness** · Return the total of every item',
        '',
        'The loop skips the first item.',
        '<!-- noslop:finding {"id":"0123456789abcdef"} -->',
      ].join('\n'),
      {
        id: '0123456789abcdef',
        title: 'Return the total of every item',
        path: 'src/a.ts',
        lens: 'correctness',
        severity: 'P2',
        riskClass: null,
        writtenByChange: true,
      },
      'c'.repeat(40),
    ),
  ).toMatchInlineSnapshot(`
    "~~**P2 · Correctness** · Return the total of every item~~
    ✅ Fixed in \`ccccccc\`

    <details><summary>Original finding</summary>

    **P2 · Correctness** · Return the total of every item

    The loop skips the first item.
    </details>
    <!-- noslop:finding {"id":"0123456789abcdef"} -->"
  `);
});

test('it names a fix that a bare fixed answer gives as fixed at the head', () => {
  expect(
    formatFixedFindingComment(
      [
        '**P2 · Correctness** · Return the total of every item',
        '',
        'The loop skips the first item.',
        '<!-- noslop:finding {"id":"0123456789abcdef"} -->',
      ].join('\n'),
      {
        id: '0123456789abcdef',
        title: 'Return the total of every item',
        path: 'src/a.ts',
        lens: 'correctness',
        severity: 'P2',
        riskClass: null,
        writtenByChange: true,
      },
      '',
    ),
  ).toStartWith(
    '~~**P2 · Correctness** · Return the total of every item~~\n✅ Fixed at the head\n',
  );
});

test('it collapses the first line of a finding outside the diff with the rest of the comment', () => {
  expect(
    formatFixedFindingComment(
      [
        'GitHub cannot anchor this finding at `src/a.ts:9-9`, outside the diff.',
        '',
        '**P3 · Tests** · Test the empty list',
        '<!-- noslop:finding {"id":"0123456789abcdef"} -->',
      ].join('\n'),
      {
        id: '0123456789abcdef',
        title: 'Test the empty list',
        path: 'src/a.ts',
        lens: 'tests',
        severity: 'P3',
        riskClass: null,
        writtenByChange: true,
      },
      'abc1234',
    ),
  ).toMatchInlineSnapshot(`
    "~~**P3 · Tests** · Test the empty list~~
    ✅ Fixed in \`abc1234\`

    <details><summary>Original finding</summary>

    GitHub cannot anchor this finding at \`src/a.ts:9-9\`, outside the diff.

    **P3 · Tests** · Test the empty list
    </details>
    <!-- noslop:finding {"id":"0123456789abcdef"} -->"
  `);
});

test('it restores a struck comment as posted once its fix no longer holds', () => {
  const posted = [
    '**P2 · Correctness** · Return the total of every item',
    '',
    'The loop skips the first item.',
    '<!-- noslop:finding {"id":"0123456789abcdef"} -->',
  ].join('\n');

  const struck = [
    '~~**P2 · Correctness** · Return the total of every item~~',
    '✅ Fixed in `ccccccc`',
    '',
    '<details><summary>Original finding</summary>',
    '',
    '**P2 · Correctness** · Return the total of every item',
    '',
    'The loop skips the first item.',
    '</details>',
    '<!-- noslop:finding {"id":"0123456789abcdef"} -->',
  ].join('\n');

  expect(
    formatFixedFindingComment(
      struck,
      {
        id: '0123456789abcdef',
        title: 'Return the total of every item',
        path: 'src/a.ts',
        lens: 'correctness',
        severity: 'P2',
        riskClass: null,
        writtenByChange: true,
      },
      null,
    ),
  ).toBe(posted);
});

test('it leaves a comment with no confirmed fix that no fix struck unchanged', () => {
  const body = [
    '**P2 · Correctness** · Return the total of every item',
    '<!-- noslop:finding {"id":"0123456789abcdef"} -->',
  ].join('\n');

  expect(
    formatFixedFindingComment(
      body,
      {
        id: '0123456789abcdef',
        title: 'Return the total of every item',
        path: 'src/a.ts',
        lens: 'correctness',
        severity: 'P2',
        riskClass: null,
        writtenByChange: true,
      },
      null,
    ),
  ).toBe(body);
});

test('it leaves a comment that a confirmed fix already struck unchanged', () => {
  const body = [
    '~~**P2 · Correctness** · Return the total of every item~~',
    '✅ Fixed in `ccccccc`',
    '<!-- noslop:finding {"id":"0123456789abcdef"} -->',
  ].join('\n');

  expect(
    formatFixedFindingComment(
      body,
      {
        id: '0123456789abcdef',
        title: 'Return the total of every item',
        path: 'src/a.ts',
        lens: 'correctness',
        severity: 'P2',
        riskClass: null,
        writtenByChange: true,
      },
      'd'.repeat(40),
    ),
  ).toBe(body);
});
