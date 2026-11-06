import { expect, test } from 'bun:test';
import { isProcessGone } from './is-process-gone';

test('it reads ESRCH as a process that is gone', () => {
  const error = Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });

  expect(isProcessGone(error)).toBe(true);
});

test('it reads EPERM as a process that still runs', () => {
  const error = Object.assign(new Error('kill EPERM'), { code: 'EPERM' });

  expect(isProcessGone(error)).toBe(false);
});

test('it reads an error with no code as a process that still runs', () => {
  expect(isProcessGone(new Error('kill failed'))).toBe(false);
});
