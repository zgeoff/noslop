import { expect, mock, test } from 'bun:test';
import { buildStubSleep } from '@noslop/testing';
import { withWriteRetry } from './with-write-retry';

test('it sends each retry only once the wait before it ends, and fails after the fourth attempt', async () => {
  const stub = buildStubSleep();

  const send = mock(() =>
    Promise.reject(Object.assign(new Error('Server Error'), { status: 500 })),
  );

  const retry = withWriteRetry('summary comment', 'repeatable', stub.sleep, send);

  const firstDelayMs = await stub.nextSleep();

  const sentInFirstWait = send.mock.calls.length;

  stub.wake();

  const secondDelayMs = await stub.nextSleep();

  const sentInSecondWait = send.mock.calls.length;

  stub.wake();

  const thirdDelayMs = await stub.nextSleep();

  const sentInThirdWait = send.mock.calls.length;

  stub.wake();

  expect(retry).rejects.toThrowWithMessage(
    Error,
    'GitHub answered the summary comment with 500 on all 4 attempts',
  );

  expect(firstDelayMs).toBe(1000);
  expect(sentInFirstWait).toBe(1);
  expect(secondDelayMs).toBe(2000);
  expect(sentInSecondWait).toBe(2);
  expect(thirdDelayMs).toBe(4000);
  expect(sentInThirdWait).toBe(3);
  expect(send).toHaveBeenCalledTimes(4);
});

test('it waits a minute, then longer, after each secondary limit with no retry-after, and fails after the fourth attempt', async () => {
  const sleep = mock((delayMs: number) => Promise.resolve(delayMs));

  const send = mock(() =>
    Promise.reject(
      Object.assign(new Error('You have exceeded a secondary rate limit'), {
        status: 403,
        response: { headers: {} },
      }),
    ),
  );

  const retry = withWriteRetry('review', 'once', sleep, send);

  expect(retry).rejects.toThrowWithMessage(
    Error,
    'GitHub answered the review with 403 (rate limit) on all 4 attempts',
  );

  await retry.catch(() => null);

  expect(sleep.mock.calls).toStrictEqual([[60_000], [120_000], [240_000]]);
});

test('it waits the retry-after seconds of a 429', async () => {
  const sleep = mock((delayMs: number) => Promise.resolve(delayMs));

  const send = mock(() =>
    Promise.reject(
      Object.assign(new Error('Too Many Requests'), {
        status: 429,
        response: { headers: { 'retry-after': '7' } },
      }),
    ),
  );

  await withWriteRetry('review', 'once', sleep, send).catch(() => null);

  expect(sleep.mock.calls).toStrictEqual([[7000], [7000], [7000]]);
});

test('it waits for the reset of a spent rate limit, by the clock of the answer', async () => {
  const sleep = mock((delayMs: number) => Promise.resolve(delayMs));

  const send = mock(() =>
    Promise.reject(
      Object.assign(new Error('Forbidden'), {
        status: 403,
        response: {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1793016030',
            date: 'Mon, 26 Oct 2026 12:00:00 GMT',
          },
        },
      }),
    ),
  );

  await withWriteRetry('review', 'once', sleep, send).catch(() => null);

  expect(sleep.mock.calls).toStrictEqual([[31_000], [31_000], [31_000]]);
});

test('it throws a spent rate limit whose reset is an hour away at once', () => {
  const sleep = mock((delayMs: number) => Promise.resolve(delayMs));

  const send = mock(() =>
    Promise.reject(
      Object.assign(new Error('Forbidden'), {
        status: 403,
        response: {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1793019600',
            date: 'Mon, 26 Oct 2026 12:00:00 GMT',
          },
        },
      }),
    ),
  );

  expect(withWriteRetry('review', 'once', sleep, send)).rejects.toMatchObject({ status: 403 });
  expect(sleep).not.toHaveBeenCalled();
});

test('it throws a 403 that names no rate limit at once', () => {
  const sleep = mock((delayMs: number) => Promise.resolve(delayMs));

  const send = mock(() =>
    Promise.reject(
      Object.assign(new Error('Resource not accessible by integration'), {
        status: 403,
        response: { headers: {} },
      }),
    ),
  );

  expect(withWriteRetry('summary comment', 'repeatable', sleep, send)).rejects.toMatchObject({
    status: 403,
  });

  expect(sleep).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledOnce();
});

test('it throws a server error of a write that runs once at once', () => {
  const sleep = mock((delayMs: number) => Promise.resolve(delayMs));

  const send = mock(() =>
    Promise.reject(Object.assign(new Error('Server Error'), { status: 500 })),
  );

  expect(withWriteRetry('review', 'once', sleep, send)).rejects.toMatchObject({ status: 500 });
  expect(sleep).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledOnce();
});
