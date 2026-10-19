import { expect, test } from 'bun:test';
import { buildHeldFixes } from './build-held-fixes';

test('it holds a fix a kept range read and did not report again', () => {
  expect(
    buildHeldFixes({
      answers: [{ id: '1111111111111111', commit: 'abc1234' }],
      marker: { reported: [], confirmed: [] },
      ranges: [
        {
          reported: [],
          confirmations: [
            { id: '1111111111111111', title: 'Await the write', commit: 'abc1234', fixed: true },
          ],
        },
      ],
    }),
  ).toStrictEqual({
    confirmed: ['1111111111111111:abc1234'],
    states: new Map([['1111111111111111:abc1234', 'retained']]),
    failures: new Map(),
  });
});

test('it holds no fix that a newer range reported again after an older one confirmed it', () => {
  expect(
    buildHeldFixes({
      answers: [{ id: '1111111111111111', commit: 'abc1234' }],
      marker: { reported: [], confirmed: [] },
      ranges: [
        { reported: ['1111111111111111'], confirmations: [] },
        {
          reported: [],
          confirmations: [
            { id: '1111111111111111', title: 'Await the write', commit: 'abc1234', fixed: true },
          ],
        },
      ],
    }).confirmed,
  ).toStrictEqual([]);
});

test('it holds a fix that a newer range confirmed after an older one reported the finding', () => {
  expect(
    buildHeldFixes({
      answers: [{ id: '1111111111111111', commit: 'abc1234' }],
      marker: { reported: [], confirmed: [] },
      ranges: [
        {
          reported: [],
          confirmations: [
            { id: '1111111111111111', title: 'Await the write', commit: 'abc1234', fixed: true },
          ],
        },
        { reported: ['1111111111111111'], confirmations: [] },
      ],
    }).confirmed,
  ).toStrictEqual(['1111111111111111:abc1234']);
});

test('it lets a newer range that skipped the finding leave an older confirmation in place', () => {
  expect(
    buildHeldFixes({
      answers: [{ id: '1111111111111111', commit: 'abc1234' }],
      marker: { reported: [], confirmed: [] },
      ranges: [
        {
          reported: [],
          confirmations: [
            { id: '1111111111111111', title: 'Await the write', commit: 'abc1234', fixed: false },
          ],
        },
        {
          reported: [],
          confirmations: [
            { id: '1111111111111111', title: 'Await the write', commit: 'abc1234', fixed: true },
          ],
        },
      ],
    }).confirmed,
  ).toStrictEqual(['1111111111111111:abc1234']);
});

test('it holds no fix the marker reports again, whatever its ranges confirm', () => {
  expect(
    buildHeldFixes({
      answers: [{ id: '1111111111111111', commit: 'abc1234' }],
      marker: { reported: ['1111111111111111'], confirmed: [] },
      ranges: [
        {
          reported: [],
          confirmations: [
            { id: '1111111111111111', title: 'Await the write', commit: 'abc1234', fixed: true },
          ],
        },
      ],
    }).confirmed,
  ).toStrictEqual([]);
});

test('it holds a fix the marker confirmed, whatever its ranges reported', () => {
  expect(
    buildHeldFixes({
      answers: [{ id: '1111111111111111', commit: 'abc1234' }],
      marker: { reported: [], confirmed: ['1111111111111111:abc1234'] },
      ranges: [{ reported: ['1111111111111111'], confirmations: [] }],
    }).confirmed,
  ).toStrictEqual(['1111111111111111:abc1234']);
});

test('it holds no fix the marker confirmed for another commit', () => {
  expect(
    buildHeldFixes({
      answers: [{ id: '1111111111111111', commit: 'abc1234' }],
      marker: { reported: [], confirmed: ['1111111111111111:def5678'] },
      ranges: [],
    }).confirmed,
  ).toStrictEqual([]);
});

test('it gives the failure of a fix it leaves unconfirmed', () => {
  expect(
    buildHeldFixes({
      answers: [{ id: '1111111111111111', commit: 'abc1234' }],
      marker: { reported: [], confirmed: [] },
      ranges: [
        {
          reported: [],
          confirmations: [
            {
              id: '1111111111111111',
              title: 'Await the write',
              commit: 'abc1234',
              fixed: false,
              failure: 'GitHub lists only part of the files of the commit',
            },
          ],
        },
      ],
    }),
  ).toStrictEqual({
    confirmed: [],
    states: new Map([['1111111111111111:abc1234', 'silent']]),
    failures: new Map([['1111111111111111', 'GitHub lists only part of the files of the commit']]),
  });
});
