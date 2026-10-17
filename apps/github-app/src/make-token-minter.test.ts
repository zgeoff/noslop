import { expect, test } from 'bun:test';
import { buildStubAppKey } from '@noslop/testing';
import { makeTokenMinter } from './make-token-minter';

test('it mints an installation token as the App', async () => {
  const mint = makeTokenMinter(1, buildStubAppKey());

  const token = await mint(7);

  expect(token).toBe('ghs_stand_in');
});
