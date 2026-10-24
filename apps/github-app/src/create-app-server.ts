import { Webhooks } from '@octokit/webhooks';
import { Elysia } from 'elysia';
import type { AppEvent } from './parse-app-event';
import { parseAppEvent } from './parse-app-event';

export interface AppServerOptions {
  webhookSecret: string;
  onEvent: (event: AppEvent) => void;
}

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

        // GitHub counts a delivery as failed when no answer comes within a few seconds, so the
        // endpoint answers before the job runs.
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
