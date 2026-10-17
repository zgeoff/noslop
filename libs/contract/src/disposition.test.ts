import { expect, test } from 'bun:test';
import type { Disposition } from './disposition';
import { dispositionSchema } from './disposition';

test('it accepts a fixed disposition with its commit', () => {
  const payload: Disposition = {
    findingID: '0123456789abcdef',
    kind: 'fixed',
    value: '1a2b3c4',
    author: 'octocat',
    authorIsOwner: false,
    source: 'github',
    at: '2026-10-17T10:00:00.000Z',
  };

  expect(dispositionSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it rejects a kind that is not a disposition', () => {
  const result = dispositionSchema.safeParse({
    findingID: '0123456789abcdef',
    kind: 'wontfix',
    value: 'later',
    author: 'octocat',
    authorIsOwner: false,
    source: 'github',
    at: '2026-10-17T10:00:00.000Z',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['kind'] });
});
