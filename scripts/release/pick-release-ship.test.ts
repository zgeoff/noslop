import { expect, test } from 'bun:test';
import { pickReleaseShip } from './pick-release-ship';

test.each([
  {
    label: 'a tag on this commit whose checks passed',
    run: {
      event: 'push',
      releasesCreated: 'true',
      releaseOutputs: '{"sha":"7d0e3b1"}',
      checksResult: 'success',
    },
    expected: 'here',
  },
  {
    label: 'a tag whose checks a newer push cancelled',
    run: {
      event: 'push',
      releasesCreated: 'true',
      releaseOutputs: '{"sha":"7d0e3b1"}',
      checksResult: 'cancelled',
    },
    expected: 'dispatch',
  },
  {
    label: 'a tag whose checks failed',
    run: {
      event: 'push',
      releasesCreated: 'true',
      releaseOutputs: '{"sha":"7d0e3b1"}',
      checksResult: 'failure',
    },
    expected: 'dispatch',
  },
  {
    label: 'a tag on another commit',
    run: {
      event: 'push',
      releasesCreated: 'true',
      releaseOutputs: '{"sha":"c52a9f4"}',
      checksResult: 'success',
    },
    expected: 'dispatch',
  },
  {
    label: 'a push that tagged nothing',
    run: { event: 'push', releasesCreated: 'false', releaseOutputs: '{}', checksResult: 'success' },
    expected: 'none',
  },
  {
    label: 'a dispatch whose checks passed',
    run: {
      event: 'workflow_dispatch',
      releasesCreated: '',
      releaseOutputs: '',
      checksResult: 'success',
    },
    expected: 'here',
  },
  {
    label: 'a dispatch whose checks failed',
    run: {
      event: 'workflow_dispatch',
      releasesCreated: '',
      releaseOutputs: '',
      checksResult: 'failure',
    },
    expected: 'none',
  },
])('it picks the ship for $label', (row) => {
  expect(pickReleaseShip({ ...row.run, sha: '7d0e3b1' })).toBe(row.expected);
});

test('it refuses release outputs that hold no tagged commit', () => {
  expect(() =>
    pickReleaseShip({
      event: 'push',
      releasesCreated: 'true',
      releaseOutputs: '{"tag_name":"@demo/cli@2.0.1"}',
      checksResult: 'success',
      sha: '7d0e3b1',
    }),
  ).toThrowWithMessage(Error, /hold no tagged commit/u);
});
