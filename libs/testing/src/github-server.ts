import { FetchInterceptor } from '@mswjs/interceptors/fetch/web';
import type { HttpNetworkFrame, NetworkSource } from 'msw/experimental';
import { InterceptorSource, defineNetwork } from 'msw/experimental';
import { githubHandlers } from './github-handlers';
import { githubPullFileHandlers } from './github-pull-file-handlers';

// msw's InterceptorSource takes any frame, so the HTTP type gives its events a typed request
const sources: NetworkSource<HttpNetworkFrame>[] = [
  new InterceptorSource({ interceptors: [new FetchInterceptor()] }),
];

// MSW 3's setupServer intercepts at Node's sockets, which Bun's native fetch never opens, so
// its handlers would miss every request; the web interceptor patches the global fetch
export const githubServer = defineNetwork({
  sources,
  handlers: [...githubHandlers, ...githubPullFileHandlers],
  context: { quiet: true },
  onUnhandledFrame: 'error',
});
