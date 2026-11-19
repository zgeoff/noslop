interface ReceivedWebhook {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface StubWebhookReceiverOptions {
  status: number;
}

export interface StubWebhookReceiver {
  url: string;
  received: ReceivedWebhook[];
  stop: () => Promise<void>;
}

// a webhook endpoint on a loopback port that records each POST to /noslop and answers it with
// the given status; Bun answers any other route with 404, so a request to the wrong path fails
export function startStubWebhookReceiver(options: StubWebhookReceiverOptions): StubWebhookReceiver {
  const received: ReceivedWebhook[] = [];

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    routes: {
      '/noslop': {
        POST: async (request) => {
          received.push({
            method: request.method,
            path: new URL(request.url).pathname,
            headers: Object.fromEntries(request.headers),
            body: await request.json(),
          });

          return new Response(null, { status: options.status });
        },
      },
    },
  });

  return {
    url: new URL('/noslop', server.url).href,
    received,
    stop: () => server.stop(true),
  };
}
