import { expect, mock, test } from 'bun:test';
import { getLogger } from '@logtape/logtape';
import { buildMockReviewResult, githubServer } from '@noslop/testing';
import { HttpResponse, http } from 'msw';
import { createWebhookReporter } from './create-webhook-reporter';

test('it sends the result as JSON with the secret header from the environment', async () => {
  const received = mock<(input: unknown) => void>();

  githubServer.use(
    http.post('https://hooks.example.test/noslop', async (info) => {
      const body: unknown = await info.request.json();

      received({ secret: info.request.headers.get('x-noslop-secret'), body });

      return HttpResponse.json({ ok: true });
    }),
  );

  const result = buildMockReviewResult();

  await createWebhookReporter({ env: { NOSLOP_HOOK_SECRET: 's3cret' } }).report(result, {
    logger: getLogger(['test']),
    options: {
      url: 'https://hooks.example.test/noslop',
      secretHeader: 'x-noslop-secret',
      secretEnv: 'NOSLOP_HOOK_SECRET',
    },
    failedReporters: [],
  });

  expect(received).toHaveBeenCalledExactlyOnceWith({ secret: 's3cret', body: result });
});

test('it fails when the webhook answers with an error status', () => {
  githubServer.use(
    http.post('https://hooks.example.test/noslop', () => new HttpResponse(null, { status: 503 })),
  );

  expect(
    createWebhookReporter({ env: {} }).report(buildMockReviewResult(), {
      logger: getLogger(['test']),
      options: { url: 'https://hooks.example.test/noslop' },
      failedReporters: [],
    }),
  ).rejects.toThrowWithMessage(Error, 'the webhook at hooks.example.test answered 503');
});

test('it refuses to send when the secret variable is not set', () => {
  expect(
    createWebhookReporter({ env: {} }).report(buildMockReviewResult(), {
      logger: getLogger(['test']),
      options: {
        url: 'https://hooks.example.test/noslop',
        secretHeader: 'x-noslop-secret',
        secretEnv: 'NOSLOP_HOOK_SECRET',
      },
      failedReporters: [],
    }),
  ).rejects.toThrowWithMessage(
    Error,
    'the webhook reporter sends x-noslop-secret from reporters.webhook.secretEnv, which names no set variable',
  );
});

test('it refuses to send when the config names no URL', () => {
  expect(
    createWebhookReporter({ env: {} }).report(buildMockReviewResult(), {
      logger: getLogger(['test']),
      options: {},
      failedReporters: [],
    }),
  ).rejects.toThrowWithMessage(
    Error,
    'the webhook reporter needs reporters.webhook.url in the config',
  );
});
