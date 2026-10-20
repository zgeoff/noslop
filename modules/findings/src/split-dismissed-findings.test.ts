import { expect, test } from 'bun:test';
import { buildMockFinding } from '@noslop/testing';
import { splitDismissedFindings } from './split-dismissed-findings';

test('it drops a finding in the same file under the same criterion a few lines from an answered one', () => {
  const finding = buildMockFinding({
    id: '2222222222222222',
    title: 'Skip no item of the loop',
    anchor: { path: 'src/a.ts', startLine: 14, endLine: 14 },
  });

  expect(
    splitDismissedFindings({
      findings: [{ finding, code: 'for (const item of items.slice(1)) {' }],
      dismissed: [
        {
          finding: {
            id: '1111111111111111',
            path: 'src/a.ts',
            criterion: 'wrong-behaviour-edge-path',
            rule: null,
            head: 'a'.repeat(40),
            startLine: 10,
            endLine: 10,
          },
          code: 'let total = 0;',
        },
      ],
      maxLines: 5,
    }),
  ).toStrictEqual({ kept: [], dismissed: [{ finding, answeredID: '1111111111111111' }] });
});

test('it keeps a finding further from an answered one than the line limit, over other code', () => {
  const finding = buildMockFinding({
    id: '2222222222222222',
    anchor: { path: 'src/a.ts', startLine: 16, endLine: 16 },
  });

  expect(
    splitDismissedFindings({
      findings: [{ finding, code: 'return total;' }],
      dismissed: [
        {
          finding: {
            id: '1111111111111111',
            path: 'src/a.ts',
            criterion: 'wrong-behaviour-edge-path',
            rule: null,
            head: 'a'.repeat(40),
            startLine: 10,
            endLine: 10,
          },
          code: 'let total = 0;',
        },
      ],
      maxLines: 5,
    }),
  ).toStrictEqual({ kept: [finding], dismissed: [] });
});

test('it drops a finding far from an answered one when its anchor holds the same code re-indented', () => {
  const finding = buildMockFinding({
    id: '2222222222222222',
    anchor: { path: 'src/a.ts', startLine: 40, endLine: 41 },
  });

  expect(
    splitDismissedFindings({
      findings: [
        { finding, code: '    for (const item of items.slice(1)) {\n\n      total += item;' },
      ],
      dismissed: [
        {
          finding: {
            id: '1111111111111111',
            path: 'src/a.ts',
            criterion: 'wrong-behaviour-edge-path',
            rule: null,
            head: 'a'.repeat(40),
            startLine: 10,
            endLine: 11,
          },
          code: 'for (const item of items.slice(1)) {\n  total  += item;',
        },
      ],
      maxLines: 5,
    }),
  ).toStrictEqual({ kept: [], dismissed: [{ finding, answeredID: '1111111111111111' }] });
});

test('it keeps a finding near an answered one under another criterion', () => {
  const finding = buildMockFinding({
    id: '2222222222222222',
    severity: 'P1',
    criterion: 'data-loss',
    anchor: { path: 'src/a.ts', startLine: 10, endLine: 10 },
  });

  expect(
    splitDismissedFindings({
      findings: [{ finding, code: 'let total = 0;' }],
      dismissed: [
        {
          finding: {
            id: '1111111111111111',
            path: 'src/a.ts',
            criterion: 'wrong-behaviour-edge-path',
            rule: null,
            head: 'a'.repeat(40),
            startLine: 10,
            endLine: 10,
          },
          code: 'let total = 0;',
        },
      ],
      maxLines: 5,
    }),
  ).toStrictEqual({ kept: [finding], dismissed: [] });
});

test('it keeps a taste finding near an answered one that cites another rule', () => {
  const finding = buildMockFinding({
    id: '2222222222222222',
    criterion: 'taste-rule',
    rule: 'style.md: Loops',
    anchor: { path: 'src/a.ts', startLine: 10, endLine: 10 },
  });

  expect(
    splitDismissedFindings({
      findings: [{ finding, code: 'let total = 0;' }],
      dismissed: [
        {
          finding: {
            id: '1111111111111111',
            path: 'src/a.ts',
            criterion: 'taste-rule',
            rule: 'style.md: Names',
            head: 'a'.repeat(40),
            startLine: 10,
            endLine: 10,
          },
          code: 'let total = 0;',
        },
      ],
      maxLines: 5,
    }),
  ).toStrictEqual({ kept: [finding], dismissed: [] });
});

test('it keeps a finding near an answered one in another file', () => {
  const finding = buildMockFinding({
    id: '2222222222222222',
    anchor: { path: 'src/b.ts', startLine: 10, endLine: 10 },
  });

  expect(
    splitDismissedFindings({
      findings: [{ finding, code: 'let total = 0;' }],
      dismissed: [
        {
          finding: {
            id: '1111111111111111',
            path: 'src/a.ts',
            criterion: 'wrong-behaviour-edge-path',
            rule: null,
            head: 'a'.repeat(40),
            startLine: 10,
            endLine: 10,
          },
          code: 'let total = 0;',
        },
      ],
      maxLines: 5,
    }),
  ).toStrictEqual({ kept: [finding], dismissed: [] });
});

test('it matches an answered finding whose marker holds no criterion by its ID alone', () => {
  const same = buildMockFinding({
    id: '1111111111111111',
    anchor: { path: 'src/a.ts', startLine: 30, endLine: 30 },
  });

  const near = buildMockFinding({
    id: '2222222222222222',
    anchor: { path: 'src/a.ts', startLine: 10, endLine: 10 },
  });

  expect(
    splitDismissedFindings({
      findings: [
        { finding: same, code: 'return total;' },
        { finding: near, code: 'let total = 0;' },
      ],
      dismissed: [
        {
          finding: {
            id: '1111111111111111',
            path: 'src/a.ts',
            criterion: null,
            rule: null,
            head: null,
            startLine: 10,
            endLine: 10,
          },
          code: null,
        },
      ],
      maxLines: 5,
    }),
  ).toStrictEqual({
    kept: [near],
    dismissed: [{ finding: same, answeredID: '1111111111111111' }],
  });
});

test('it never matches 2 anchors on blank code alone', () => {
  const finding = buildMockFinding({
    id: '2222222222222222',
    anchor: { path: 'src/a.ts', startLine: 40, endLine: 40 },
  });

  expect(
    splitDismissedFindings({
      findings: [{ finding, code: '  ' }],
      dismissed: [
        {
          finding: {
            id: '1111111111111111',
            path: 'src/a.ts',
            criterion: 'wrong-behaviour-edge-path',
            rule: null,
            head: 'a'.repeat(40),
            startLine: 10,
            endLine: 10,
          },
          code: '',
        },
      ],
      maxLines: 5,
    }),
  ).toStrictEqual({ kept: [finding], dismissed: [] });
});

test('it keeps a P1 finding near an answered one under the same file, criterion and rule', () => {
  const finding = buildMockFinding({
    id: '2222222222222222',
    severity: 'P1',
    criterion: 'data-loss',
    anchor: { path: 'src/a.ts', startLine: 12, endLine: 12 },
  });

  expect(
    splitDismissedFindings({
      findings: [{ finding, code: 'let total = 0;' }],
      dismissed: [
        {
          finding: {
            id: '1111111111111111',
            path: 'src/a.ts',
            criterion: 'data-loss',
            rule: null,
            head: 'a'.repeat(40),
            startLine: 10,
            endLine: 10,
          },
          code: 'let total = 0;',
        },
      ],
      maxLines: 5,
    }),
  ).toStrictEqual({ kept: [finding], dismissed: [] });
});

test('it keeps a P2 security finding near an answered one under the same file, criterion and rule', () => {
  const finding = buildMockFinding({
    id: '2222222222222222',
    severity: 'P2',
    criterion: 'security-defect',
    anchor: { path: 'src/a.ts', startLine: 12, endLine: 12 },
  });

  expect(
    splitDismissedFindings({
      findings: [{ finding, code: "const query = 'select * from notes where id = ' + id;" }],
      dismissed: [
        {
          finding: {
            id: '1111111111111111',
            path: 'src/a.ts',
            criterion: 'security-defect',
            rule: null,
            head: 'a'.repeat(40),
            startLine: 10,
            endLine: 10,
          },
          code: "const query = 'select * from notes where id = ' + id;",
        },
      ],
      maxLines: 5,
    }),
  ).toStrictEqual({ kept: [finding], dismissed: [] });
});

test('it drops a P1 finding whose own ID was answered', () => {
  const finding = buildMockFinding({
    id: '1111111111111111',
    severity: 'P1',
    criterion: 'data-loss',
    anchor: { path: 'src/a.ts', startLine: 30, endLine: 30 },
  });

  expect(
    splitDismissedFindings({
      findings: [{ finding, code: 'return total;' }],
      dismissed: [
        {
          finding: {
            id: '1111111111111111',
            path: 'src/a.ts',
            criterion: 'data-loss',
            rule: null,
            head: 'a'.repeat(40),
            startLine: 10,
            endLine: 10,
          },
          code: 'let total = 0;',
        },
      ],
      maxLines: 5,
    }),
  ).toStrictEqual({ kept: [], dismissed: [{ finding, answeredID: '1111111111111111' }] });
});
