import { expect, test } from 'bun:test';
import { buildStubSleep } from './build-stub-sleep';

test('it hands out the delay of a sleep that started before the test asked for it', async () => {
  const stub = buildStubSleep();

  void stub.sleep(1000);

  const delayMs = await stub.nextSleep();

  expect(delayMs).toBe(1000);
});

test('it hands out the delay of a sleep that starts after the test asked for it', async () => {
  const stub = buildStubSleep();
  const next = stub.nextSleep();

  void stub.sleep(2000);

  const delayMs = await next;

  expect(delayMs).toBe(2000);
});

test('it ends the oldest running sleep on a wake', async () => {
  const stub = buildStubSleep();

  const first = (async () => {
    await stub.sleep(1000);

    return 'first';
  })();

  const second = (async () => {
    await stub.sleep(2000);

    return 'second';
  })();

  stub.wake();

  const ended = await Promise.race([first, second]);

  expect(ended).toBe('first');
});

test('it refuses to wake when no sleep is running', () => {
  const stub = buildStubSleep();

  expect(() => {
    stub.wake();
  }).toThrowWithMessage(Error, 'no sleep is running to wake');
});
