import { expect, test } from 'bun:test';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import { buildMockChangedFile } from '@noslop/testing';
import { buildFindingID } from './build-finding-id';
import { buildFindings } from './build-findings';

test('it keeps a finding on a changed line with its ID, severity and change marker', () => {
  const result = buildFindings({
    raw: [
      {
        lens: 'correctness',
        callID: 'A',
        finding: {
          title: 'Keep the items until the write succeeds',
          body: 'The loop deletes each item before the write, so a failed write loses them.',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'data-loss',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: 'Delete each item after the write.',
        },
      },
    ],
    files: [buildMockChangedFile()],
    ruleNames: [],
    riskClasses: [],
    config: BUILT_IN_DEFAULTS,
  });

  expect(result).toStrictEqual({
    findings: [
      {
        id: buildFindingID(
          'correctness',
          'src/a.ts',
          'data-loss',
          'Keep the items until the write succeeds',
        ),
        lens: 'correctness',
        callID: 'A',
        title: 'Keep the items until the write succeeds',
        body: 'The loop deletes each item before the write, so a failed write loses them.',
        anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
        severity: 'P1',
        criterion: 'data-loss',
        verdict: 'CONFIRMED',
        writtenByChange: true,
        fix: 'Delete each item after the write.',
      },
    ],
    dropped: [],
  });
});

test('it drops findings that break the finding rules, each with its reason', () => {
  const result = buildFindings({
    raw: [
      {
        lens: 'correctness',
        callID: 'A',
        finding: {
          title: 'Off the diff',
          body: 'The anchor sits in a file the change leaves alone.',
          anchor: { path: 'src/other.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'wrong-behaviour-edge-path',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
      {
        lens: 'naming-shape-and-comments',
        callID: 'C',
        finding: {
          title: 'Rename the helper',
          body: 'The name breaks a rule the rules file does not hold.',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'taste-rule',
          rule: 'No such rule',
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
      {
        lens: 'deploy-and-config',
        callID: 'D',
        finding: {
          title: 'Check the port in production',
          body: 'The port may differ in production.',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'outage',
          rule: null,
          verdict: 'PLAUSIBLE',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
    ],
    files: [buildMockChangedFile()],
    ruleNames: ['Context goes last'],
    riskClasses: [],
    config: BUILT_IN_DEFAULTS,
  });

  expect([
    result.findings,
    result.dropped.map((item) => [item.raw.lens, item.reason]),
  ]).toStrictEqual([
    [],
    [
      ['correctness', 'anchor-outside-diff'],
      ['naming-shape-and-comments', 'unknown-rule'],
      ['deploy-and-config', 'plausible-without-fact'],
    ],
  ]);
});

test('it drops a finding on a context line unless it cites a second location or a missing change', () => {
  const file = buildMockChangedFile({
    hunks: [
      {
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 3,
        lines: [
          { kind: 'context', text: 'const a = 1;', oldLine: 1, newLine: 1 },
          { kind: 'added', text: 'const b = 2;', oldLine: null, newLine: 2 },
          { kind: 'context', text: 'const c = 3;', oldLine: 2, newLine: 3 },
        ],
      },
    ],
  });

  const result = buildFindings({
    raw: [
      {
        lens: 'correctness',
        callID: 'A',
        finding: {
          title: 'Fix the context line',
          body: 'The line the change left alone is wrong.',
          anchor: { path: 'src/a.ts', startLine: 3, endLine: 3 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'wrong-behaviour-edge-path',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
      {
        lens: 'cross-repo-and-platform-limits',
        callID: 'D',
        finding: {
          title: 'Update the consumer that reads the old shape',
          body: 'The consumer still reads the field the change renamed.',
          anchor: { path: 'src/a.ts', startLine: 3, endLine: 3 },
          secondLocation: null,
          severity: 'P1',
          criterion: 'outage',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: true,
          fix: null,
        },
      },
    ],
    files: [file],
    ruleNames: [],
    riskClasses: [],
    config: BUILT_IN_DEFAULTS,
  });

  expect([
    result.findings.map((finding) => [finding.lens, finding.writtenByChange]),
    result.dropped.map((item) => item.reason),
  ]).toStrictEqual([
    [['cross-repo-and-platform-limits', false]],
    ['outside-diff-without-location'],
  ]);
});

test('it merges 2 findings of one defect into the one with the higher severity', () => {
  const result = buildFindings({
    raw: [
      {
        lens: 'failure-handling-and-observability',
        callID: 'A',
        finding: {
          title: 'Catch the failed write',
          body: 'A failed write leaves the job running.',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'wrong-behaviour-edge-path',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
      {
        lens: 'correctness',
        callID: 'A',
        finding: {
          title: 'Catch the failed write!',
          body: 'A failed write loses the batch.',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P1',
          criterion: 'data-loss',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
    ],
    files: [buildMockChangedFile()],
    ruleNames: [],
    riskClasses: [],
    config: BUILT_IN_DEFAULTS,
  });

  expect(result.findings.map((finding) => [finding.lens, finding.severity])).toStrictEqual([
    ['correctness', 'P1'],
  ]);
});

test('it merges a shorter wording of one defect on overlapping lines', () => {
  const result = buildFindings({
    raw: [
      {
        lens: 'correctness',
        callID: 'A',
        finding: {
          title: "Keep the transient watcher's interval when replacing it",
          body: 'The new unit starts at the default interval, so the watcher runs 10 times as often.',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 2 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'wrong-behaviour-edge-path',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
      {
        lens: 'deploy-and-config',
        callID: 'D',
        finding: {
          title: "Keep the transient watcher's interval when replacing it on the first install",
          body: 'The first install drops the interval the transient unit ran with.',
          anchor: { path: 'src/a.ts', startLine: 2, endLine: 2 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'wrong-behaviour-edge-path',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
    ],
    files: [buildMockChangedFile()],
    ruleNames: [],
    riskClasses: [],
    config: BUILT_IN_DEFAULTS,
  });

  expect(result.findings.map((finding) => [finding.lens, finding.callID])).toStrictEqual([
    ['correctness', 'A'],
  ]);
});

test('it keeps a test finding apart from a fix finding on the same lines', () => {
  const result = buildFindings({
    raw: [
      {
        lens: 'correctness',
        callID: 'A',
        finding: {
          title: 'Stop piping the find into sort so a failed listing stops the reset',
          body: 'The pipe takes the exit status of sort, so a failed find goes unseen.',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'wrong-behaviour-edge-path',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
      {
        lens: 'tests',
        callID: 'E',
        finding: {
          title: 'Add a failed-listing test so a failed find stops the reset',
          body: 'No test makes the find fail, so the pipe hides it.',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'wrong-behaviour-edge-path',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
    ],
    files: [buildMockChangedFile()],
    ruleNames: [],
    riskClasses: [],
    config: BUILT_IN_DEFAULTS,
  });

  expect(result.findings.map((finding) => finding.lens)).toStrictEqual(['correctness', 'tests']);
});

test('it keeps 2 findings on overlapping lines whose titles each hold a word the other lacks', () => {
  const result = buildFindings({
    raw: [
      {
        lens: 'correctness',
        callID: 'A',
        finding: {
          title: 'Reject null values in the request body',
          body: 'A null field in the request reaches the write.',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'wrong-behaviour-edge-path',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
      {
        lens: 'failure-handling-and-observability',
        callID: 'A',
        finding: {
          title: 'Reject null values in the response body',
          body: 'A null field in the response reaches the client.',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'wrong-behaviour-edge-path',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
    ],
    files: [buildMockChangedFile()],
    ruleNames: [],
    riskClasses: [],
    config: BUILT_IN_DEFAULTS,
  });

  expect(result.findings).toHaveLength(2);
});

test('it marks the risk class whose paths hold the anchor', () => {
  const result = buildFindings({
    raw: [
      {
        lens: 'security',
        callID: 'B',
        finding: {
          title: 'Refuse a session with no user',
          body: 'The check lets a session with no user through.',
          anchor: { path: 'src/auth/session.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P1',
          criterion: 'security-defect',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
    ],
    files: [buildMockChangedFile({ path: 'src/auth/session.ts' })],
    ruleNames: [],
    riskClasses: ['auth'],
    config: BUILT_IN_DEFAULTS,
  });

  expect(result.findings.map((finding) => finding.riskClass)).toStrictEqual(['auth']);
});

test('it keeps 2 taste findings on one line that cite different rules', () => {
  const result = buildFindings({
    raw: [
      {
        lens: 'naming-shape-and-comments',
        callID: 'C',
        finding: {
          title: 'Name the helper for what it returns',
          body: 'The name hides the value the helper returns.',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'taste-rule',
          rule: 'Names say what they return',
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
      {
        lens: 'naming-shape-and-comments',
        callID: 'C',
        finding: {
          title: 'Move the helper below its caller',
          body: 'The helper sits above the export that calls it.',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
          secondLocation: null,
          severity: 'P2',
          criterion: 'taste-rule',
          rule: 'Helpers follow the export',
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
    ],
    files: [buildMockChangedFile()],
    ruleNames: ['Names say what they return', 'Helpers follow the export'],
    riskClasses: [],
    config: BUILT_IN_DEFAULTS,
  });

  expect(result.findings.map((finding) => finding.rule)).toStrictEqual([
    'Names say what they return',
    'Helpers follow the export',
  ]);
});

test('it anchors a deleted line to the head line after it, as the static stage does', () => {
  const file = buildMockChangedFile({
    hunks: [
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 2,
        lines: [
          { kind: 'context', text: 'const a = 1;', oldLine: 1, newLine: 1 },
          { kind: 'deleted', text: 'await rollback();', oldLine: 2, newLine: null },
          { kind: 'context', text: 'const c = 3;', oldLine: 3, newLine: 2 },
        ],
      },
    ],
  });

  const result = buildFindings({
    raw: [
      {
        lens: 'failure-handling-and-observability',
        callID: 'A',
        finding: {
          title: 'Restore the rollback on a failed write',
          body: 'The change deletes the rollback, so a failed write leaves the partial state.',
          anchor: { path: 'src/a.ts', startLine: 2, endLine: 2 },
          secondLocation: null,
          severity: 'P1',
          criterion: 'data-loss',
          rule: null,
          verdict: 'CONFIRMED',
          unverifiedFact: null,
          missingChange: false,
          fix: null,
        },
      },
    ],
    files: [file],
    ruleNames: [],
    riskClasses: [],
    config: BUILT_IN_DEFAULTS,
  });

  expect([result.findings.map((finding) => finding.anchor), result.dropped]).toStrictEqual([
    [{ path: 'src/a.ts', startLine: 2, endLine: 2 }],
    [],
  ]);
});

test('it gives one defect reported at 2 places of a file 2 different IDs', () => {
  const file = buildMockChangedFile({
    hunks: [
      {
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: 3,
        lines: [
          { kind: 'added', text: 'write(a);', oldLine: null, newLine: 1 },
          { kind: 'added', text: '', oldLine: null, newLine: 2 },
          { kind: 'added', text: 'write(b);', oldLine: null, newLine: 3 },
        ],
      },
    ],
  });

  const result = buildFindings({
    raw: [1, 3].map((line) => ({
      lens: 'correctness' as const,
      callID: 'A',
      finding: {
        title: 'Await the write',
        body: 'The write is not awaited, so its failure goes unseen.',
        anchor: { path: 'src/a.ts', startLine: line, endLine: line },
        secondLocation: null,
        severity: 'P2' as const,
        criterion: 'wrong-behaviour-edge-path' as const,
        rule: null,
        verdict: 'CONFIRMED' as const,
        unverifiedFact: null,
        missingChange: false,
        fix: null,
      },
    })),
    files: [file],
    ruleNames: [],
    riskClasses: [],
    config: BUILT_IN_DEFAULTS,
  });

  const ids = result.findings.map((finding) => finding.id);

  expect(ids[0]).toBe(
    buildFindingID('correctness', 'src/a.ts', 'wrong-behaviour-edge-path', 'Await the write'),
  );

  expect(new Set(ids).size).toBe(2);
});
