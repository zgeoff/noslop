import { expect, test } from 'bun:test';
import { buildTempPrefix } from './build-temp-prefix';

test('it names the PID and the PID namespace before the folder name', () => {
  expect(buildTempPrefix(4321, '4026531836')).toBe('pid4321-ns4026531836-');
});

test('it names a system with no PID namespace link as none', () => {
  expect(buildTempPrefix(4321, 'none')).toBe('pid4321-nsnone-');
});
