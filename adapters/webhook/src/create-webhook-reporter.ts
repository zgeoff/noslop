import type { Reporter } from '@noslop/contract';

export interface WebhookReporterOptions {
  env: Readonly<Record<string, string | undefined>>;
}

export function createWebhookReporter(options: WebhookReporterOptions): Reporter {
  return {
    id: 'webhook',
    report: async (result, ctx) => {
      const url = ctx.options.url;

      if (url === undefined) {
        throw new Error('the webhook reporter needs reporters.webhook.url in the config');
      }

      const headers: Record<string, string> = { 'content-type': 'application/json' };
      const header = ctx.options.secretHeader;

      if (header !== undefined) {
        const secret = options.env[ctx.options.secretEnv ?? ''];

        if (secret === undefined || secret === '') {
          throw new Error(
            `the webhook reporter sends ${header} from reporters.webhook.secretEnv, which names no set variable`,
          );
        }

        headers[header] = secret;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(result),
      });

      if (!response.ok) {
        throw new Error(`the webhook at ${new URL(url).host} answered ${response.status}`);
      }
    },
  };
}
