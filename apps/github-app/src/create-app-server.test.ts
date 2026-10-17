import { expect, mock, test } from 'bun:test';
import { Webhooks } from '@octokit/webhooks';
import { createAppServer } from './create-app-server';
import type { AppEvent } from './parse-app-event';

function setupTest() {
  const onEvent = mock<(event: AppEvent) => void>();
  const server = createAppServer({ webhookSecret: 'shared-secret', onEvent });

  return { server, onEvent, webhooks: new Webhooks({ secret: 'shared-secret' }) };
}

test('it queues a signed delivery that the App acts on', async () => {
  const ctx = setupTest();

  const payload = JSON.stringify({
    action: 'opened',
    installation: { id: 7 },
    repository: { name: 'app', owner: { login: 'example' } },
    sender: { type: 'User' },
    pull_request: { number: 5, draft: false },
  });

  const signature = await ctx.webhooks.sign(payload);

  const response = await ctx.server.handle(
    new Request('http://localhost/webhook', {
      method: 'POST',
      headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': signature },
      body: payload,
    }),
  );

  expect(response.status).toBe(202);

  expect(ctx.onEvent).toHaveBeenCalledExactlyOnceWith({
    kind: 'review',
    owner: 'example',
    repo: 'app',
    number: 5,
    installationID: 7,
  });
});

test('it refuses a delivery whose signature does not match the secret', async () => {
  const ctx = setupTest();
  const payload = JSON.stringify({ action: 'opened' });

  const signature = await new Webhooks({ secret: 'another-secret' }).sign(payload);

  const response = await ctx.server.handle(
    new Request('http://localhost/webhook', {
      method: 'POST',
      headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': signature },
      body: payload,
    }),
  );

  expect(response.status).toBe(401);
  expect(ctx.onEvent).not.toHaveBeenCalled();
});

test('it answers a signed delivery it leaves be with no content', async () => {
  const ctx = setupTest();
  const payload = JSON.stringify({ ref: 'refs/heads/main' });

  const signature = await ctx.webhooks.sign(payload);

  const response = await ctx.server.handle(
    new Request('http://localhost/webhook', {
      method: 'POST',
      headers: { 'x-github-event': 'push', 'x-hub-signature-256': signature },
      body: payload,
    }),
  );

  expect(response.status).toBe(204);
  expect(ctx.onEvent).not.toHaveBeenCalled();
});
