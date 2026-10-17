import { Webhooks } from '@octokit/webhooks';
import { Elysia } from 'elysia';
import type { AppEvent } from './parse-app-event';
import { parseAppEvent } from './parse-app-event';

export interface AppServerOptions {
  webhookSecret: string;
  onEvent: (event: AppEvent) => void;
}

// the App's webhook endpoint: it checks each delivery's signature against the shared secret, hands a
// delivery the App acts on to the queue, and answers at once, because GitHub gives a delivery only a
// few seconds before it counts as failed
export function createAppServer(options: AppServerOptions) {
  const webhooks = new Webhooks({ secret: options.webhookSecret });

  return new Elysia()
    .get('/health', () => 'ok')
    .post(
      '/webhook',
      async (context) => {
        const payload = await context.request.text();

        const signature = context.request.headers.get('x-hub-signature-256') ?? '';

        const isSigned = await webhooks.verify(payload, signature).catch(() => false);

        if (!isSigned) {
          return new Response('bad signature', { status: 401 });
        }

        const name = context.request.headers.get('x-github-event') ?? '';
        const event = parseAppEvent(name, parseJSON(payload));

        if (event === null) {
          return new Response(null, { status: 204 });
        }

        options.onEvent(event);

        return new Response('queued', { status: 202 });
      },
      { parse: 'none' },
    );
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
