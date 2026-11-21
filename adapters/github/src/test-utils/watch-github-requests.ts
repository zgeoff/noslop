import { http } from 'msw';
import { githubNetwork } from './github-network';

// Calls onRequest with each request until the test ends, then lets the request reach the handler
// that answers it.
export function watchGitHubRequests(onRequest: (request: Request) => void): void {
  githubNetwork.use(
    http.all('*', (info) => {
      onRequest(info.request);
    }),
  );
}
