import { expect, mock, test } from 'bun:test';
import { buildStubSleep } from '@noslop/testing';
import { withServerErrorRetry } from './with-server-error-retry';

test('it sends each retry only once the wait before it ends, and fails after the fourth attempt', async () => {
  const stub = buildStubSleep();

  const send = mock(() =>
    Promise.reject(Object.assign(new Error('Server Error'), { status: 500 })),
  );

  const retry = withServerErrorRetry('summary comment', stub.sleep, send);

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
