import { expect, onTestFinished, test } from 'bun:test';
import { startStubWebhookReceiver } from './start-stub-webhook-receiver';

test('it records a JSON POST to its URL and answers with the given status', async () => {
  const receiver = startStubWebhookReceiver({ status: 202 });

  onTestFinished(() => receiver.stop());

  const response = await fetch(receiver.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ verdict: 'pass' }),
  });

  expect(response.status).toBe(202);

  expect(receiver.received).toStrictEqual([
    {
      method: 'POST',
      path: '/noslop',
      headers: expect.objectContaining({ 'content-type': 'application/json' }),
      body: { verdict: 'pass' },
    },
  ]);
});

test('it answers 404 to a request on another path and records nothing', async () => {
  const receiver = startStubWebhookReceiver({ status: 200 });

  onTestFinished(() => receiver.stop());

  const response = await fetch(new URL('/elsewhere', receiver.url), {
    method: 'POST',
    body: '{}',
  });

  expect(response.status).toBe(404);
  expect(receiver.received).toStrictEqual([]);
});
