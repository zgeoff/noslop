import { expect, test } from 'bun:test';
import { buildMockReviewResult } from '@noslop/testing';
import { buildFixConfirmations } from './build-fix-confirmations';

test('it confirms no fix of a finding the review no longer reports without a fix call verdict', () => {
  expect(
    buildFixConfirmations({
      findings: [
        {
          id: '1111111111111111',
          title: 'Reject an empty separator',
          path: 'src/scan.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: true,
        },
      ],
      dispositions: [
        {
          findingID: '1111111111111111',
          kind: 'fixed',
          value: 'abc1234',
          author: 'dev',
          authorIsOwner: false,
          source: 'github',
          at: '2026-10-17T10:00:00.000Z',
        },
      ],
      confirmed: [],
      reported: [],
      result: buildMockReviewResult({ findings: [] }),
    }),
  ).toStrictEqual([
    { id: '1111111111111111', title: 'Reject an empty separator', commit: 'abc1234', fixed: false },
  ]);
});

test('it confirms a fix that a fix call judged fixed', () => {
  expect(
    buildFixConfirmations({
      findings: [
        {
          id: '1111111111111111',
          title: 'Reject an empty separator',
          path: 'src/scan.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: true,
        },
      ],
      dispositions: [
        {
          findingID: '1111111111111111',
          kind: 'fixed',
          value: '',
          author: 'dev',
          authorIsOwner: false,
          source: 'github',
          at: '2026-10-17T10:00:00.000Z',
        },
      ],
      confirmed: [],
      reported: [],
      result: buildMockReviewResult({
        fixChecks: [
          { findingID: '1111111111111111', fixed: true, reason: 'The separator is a colon now.' },
        ],
      }),
    }),
  ).toStrictEqual([
    { id: '1111111111111111', title: 'Reject an empty separator', commit: '', fixed: true },
  ]);
});

test("it leaves a fix open with the fix call's reason when the call judged it not fixed", () => {
  expect(
    buildFixConfirmations({
      findings: [
        {
          id: '1111111111111111',
          title: 'Reject an empty separator',
          path: 'src/scan.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: true,
        },
      ],
      dispositions: [
        {
          findingID: '1111111111111111',
          kind: 'fixed',
          value: 'abc1234',
          author: 'dev',
          authorIsOwner: false,
          source: 'github',
          at: '2026-10-17T10:00:00.000Z',
        },
      ],
      confirmed: ['1111111111111111:abc1234'],
      reported: ['1111111111111111'],
      result: buildMockReviewResult({
        fixChecks: [
          { findingID: '1111111111111111', fixed: false, reason: 'The separator is still empty.' },
        ],
      }),
    }),
  ).toStrictEqual([
    {
      id: '1111111111111111',
      title: 'Reject an empty separator',
      commit: 'abc1234',
      fixed: false,
      failure: 'The separator is still empty.',
    },
  ]);
});

test('it revokes a confirmed fix whose finding the review reports again', () => {
  expect(
    buildFixConfirmations({
      findings: [
        {
          id: '1111111111111111',
          title: 'Reject an empty separator',
          path: 'src/scan.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: true,
        },
      ],
      dispositions: [
        {
          findingID: '1111111111111111',
          kind: 'fixed',
          value: 'abc1234',
          author: 'dev',
          authorIsOwner: false,
          source: 'github',
          at: '2026-10-17T10:00:00.000Z',
        },
      ],
      confirmed: ['1111111111111111:abc1234'],
      reported: ['1111111111111111'],
      result: buildMockReviewResult(),
    }),
  ).toStrictEqual([
    { id: '1111111111111111', title: 'Reject an empty separator', commit: 'abc1234', fixed: false },
  ]);
});

test('it keeps a fix an earlier fix call confirmed when the review neither judges nor reports it', () => {
  expect(
    buildFixConfirmations({
      findings: [
        {
          id: '1111111111111111',
          title: 'Reject an empty separator',
          path: 'src/scan.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: true,
        },
      ],
      dispositions: [
        {
          findingID: '1111111111111111',
          kind: 'fixed',
          value: 'abc1234',
          author: 'dev',
          authorIsOwner: false,
          source: 'github',
          at: '2026-10-17T10:00:00.000Z',
        },
      ],
      confirmed: ['1111111111111111:abc1234'],
      reported: [],
      result: buildMockReviewResult(),
    }),
  ).toStrictEqual([
    { id: '1111111111111111', title: 'Reject an empty separator', commit: 'abc1234', fixed: true },
  ]);
});

test('it confirms no fix whose answer names another sha than the confirmed one', () => {
  expect(
    buildFixConfirmations({
      findings: [
        {
          id: '1111111111111111',
          title: 'Reject an empty separator',
          path: 'src/scan.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: true,
        },
      ],
      dispositions: [
        {
          findingID: '1111111111111111',
          kind: 'fixed',
          value: 'def5678',
          author: 'dev',
          authorIsOwner: false,
          source: 'github',
          at: '2026-10-17T10:00:00.000Z',
        },
      ],
      confirmed: ['1111111111111111:abc1234'],
      reported: [],
      result: buildMockReviewResult(),
    }),
  ).toStrictEqual([
    { id: '1111111111111111', title: 'Reject an empty separator', commit: 'def5678', fixed: false },
  ]);
});

test('it says why no fix call judged a fix whose file passes the file limit', () => {
  expect(
    buildFixConfirmations({
      findings: [
        {
          id: '1111111111111111',
          title: 'Reject an empty separator',
          path: 'src/scan.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: true,
        },
      ],
      dispositions: [
        {
          findingID: '1111111111111111',
          kind: 'fixed',
          value: 'abc1234',
          author: 'dev',
          authorIsOwner: false,
          source: 'github',
          at: '2026-10-17T10:00:00.000Z',
        },
      ],
      confirmed: [],
      reported: [],
      result: buildMockReviewResult({
        fixChecks: [],
        notReviewed: [{ path: 'src/scan.ts', reason: 'too-large' }],
      }),
    }),
  ).toStrictEqual([
    {
      id: '1111111111111111',
      title: 'Reject an empty separator',
      commit: 'abc1234',
      fixed: false,
      failure: 'unjudged: its diff passes the file limit, so no call read it whole',
    },
  ]);
});

test('it lists no finding whose latest answer is not fixed', () => {
  expect(
    buildFixConfirmations({
      findings: [
        {
          id: '1111111111111111',
          title: 'Reject an empty separator',
          path: 'src/scan.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: true,
        },
      ],
      dispositions: [
        {
          findingID: '1111111111111111',
          kind: 'fixed',
          value: 'abc1234',
          author: 'dev',
          authorIsOwner: false,
          source: 'github',
          at: '2026-10-17T10:00:00.000Z',
        },
        {
          findingID: '1111111111111111',
          kind: 'not-a-defect',
          value: 'The separator comes from a checked config.',
          author: 'dev',
          authorIsOwner: false,
          source: 'github',
          at: '2026-10-17T10:05:00.000Z',
        },
      ],
      confirmed: ['1111111111111111:abc1234'],
      reported: [],
      result: buildMockReviewResult(),
    }),
  ).toStrictEqual([]);
});
