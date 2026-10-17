import { expect, test } from 'bun:test';
import { buildMockFinding } from '@noslop/testing';
import { buildTaskFinding } from './build-verify-task';

test('it keeps the rule and the second location a verifier needs to report a finding again', () => {
  expect(
    buildTaskFinding(
      buildMockFinding({
        lens: 'naming-shape-and-comments',
        rule: 'Context goes last',
        secondLocation: {
          repo: 'example/web',
          commit: 'abcdef1',
          path: 'src/call.ts',
          startLine: 3,
          endLine: 3,
        },
      }),
    ),
  ).toMatchObject({
    lens: 'naming-shape-and-comments',
    rule: 'Context goes last',
    secondLocation: {
      repo: 'example/web',
      commit: 'abcdef1',
      path: 'src/call.ts',
      startLine: 3,
      endLine: 3,
    },
  });
});

test('it leaves out the IDs that only noslop uses', () => {
  expect(buildTaskFinding(buildMockFinding())).not.toContainAnyKeys(['id', 'callID']);
});
