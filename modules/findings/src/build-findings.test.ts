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
