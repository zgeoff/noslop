import { FetchInterceptor } from '@mswjs/interceptors/fetch/web';
import type { NetworkSource } from 'msw/experimental';
import { HttpNetworkFrame, InterceptorSource, defineNetwork } from 'msw/experimental';
import { githubContentHandlers } from './github-content-handlers';
import { githubHandlers } from './github-handlers';
import { githubPullFileHandlers } from './github-pull-file-handlers';

const loopbackHosts = new Set(['127.0.0.1', '[::1]', 'localhost']);

// msw's InterceptorSource takes any frame, so the HTTP type gives its events a typed request
const sources: NetworkSource<HttpNetworkFrame>[] = [
  new InterceptorSource({ interceptors: [new FetchInterceptor()] }),
];

// MSW 3's setupServer intercepts at Node's sockets, which Bun's native fetch never opens, so
// its handlers would miss every request; the web interceptor patches the global fetch
export const githubServer = defineNetwork({
  sources,
  handlers: [...githubHandlers, ...githubPullFileHandlers, ...githubContentHandlers],
  context: { quiet: true },

  // the webhook tests and the CLI relay test call test servers on ephemeral loopback ports
  onUnhandledFrame: (unhandled) => {
    const frame = unhandled.frame;

    if (
      frame instanceof HttpNetworkFrame &&
      loopbackHosts.has(new URL(frame.data.request.url).hostname)
    ) {
      return;
    }

    unhandled.defaults.error();

    // a network-error response rejects the request, as the 'error' strategy does
    frame.errorWith(Response.error());
  },
});
