import { expect, test } from 'bun:test';
import { buildMockChangedFile } from '@noslop/testing';
import { isReleaseChange } from './is-release-change';

test('it treats a top-level version bump and a changelog as a release', () => {
  expect(
    isReleaseChange(
      [
        buildMockChangedFile({ path: 'package.json' }),
        buildMockChangedFile({ path: 'CHANGELOG.md' }),
      ],
      new Map([['package.json', '{"name":"a","version":"1.0.0"}']]),
      new Map([['package.json', '{"name":"a","version":"1.1.0"}']]),
    ),
  ).toBe(true);
});

test('it treats a change to a script named version as no release', () => {
  expect(
    isReleaseChange(
      [buildMockChangedFile({ path: 'package.json' })],
      new Map([['package.json', '{"version":"1.0.0","scripts":{"version":"a"}}']]),
      new Map([['package.json', '{"version":"1.0.0","scripts":{"version":"b"}}']]),
    ),
  ).toBe(false);
});

test('it treats a bump beside another manifest edit as no release', () => {
  expect(
    isReleaseChange(
      [buildMockChangedFile({ path: 'package.json' })],
      new Map([['package.json', '{"version":"1.0.0","private":true}']]),
      new Map([['package.json', '{"version":"1.1.0","private":false}']]),
    ),
  ).toBe(false);
});
