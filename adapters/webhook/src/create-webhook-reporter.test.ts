import { expect, onTestFinished, test } from 'bun:test';
import { getLogger } from '@logtape/logtape';
import { buildMockReviewResult } from '@noslop/contract/test-utils/build-mock-review-result';
import { createWebhookReporter } from './create-webhook-reporter';
import { startStubWebhookReceiver } from './test-utils/start-stub-webhook-receiver';

test('it sends the result as JSON with the secret header from the environment', async () => {
  const receiver = startStubWebhookReceiver({ status: 200 });

  onTestFinished(() => receiver.stop());

  const result = buildMockReviewResult();

  await createWebhookReporter({ env: { NOSLOP_HOOK_SECRET: 's3cret' } }).report(result, {
    logger: getLogger(['test']),
    options: {
      url: receiver.url,
      secretHeader: 'x-noslop-secret',
      secretEnv: 'NOSLOP_HOOK_SECRET',
    },
  });

  expect(receiver.received).toStrictEqual([
    {
      method: 'POST',
      path: '/noslop',
      headers: expect.objectContaining({
        'content-type': 'application/json',
        'x-noslop-secret': 's3cret',
      }),
      body: result,
    },
  ]);
});

test('it fails when the webhook answers with an error status', () => {
  const receiver = startStubWebhookReceiver({ status: 503 });

  onTestFinished(() => receiver.stop());

  expect(
    createWebhookReporter({ env: {} }).report(buildMockReviewResult(), {
      logger: getLogger(['test']),
      options: { url: receiver.url },
    }),
  ).rejects.toThrowWithMessage(Error, `the webhook at ${new URL(receiver.url).host} answered 503`);
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
    }),
  ).rejects.toThrowWithMessage(
    Error,
    'the webhook reporter needs reporters.webhook.url in the config',
  );
});
