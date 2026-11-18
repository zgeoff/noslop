import { http } from 'msw';
import { githubCollections } from './github-collections';
import { GITHUB_API_URL } from './github-handlers';

export interface StubRetarget {
  number: number;
  baseRef: string;
}

export function createStubRetargetDuringRead(retarget: StubRetarget) {
  return http.get(
    `${GITHUB_API_URL}/repos/:owner/:repo/contents/*`,
    async () => {
      await githubCollections.pullRequests.update(
        (query) => query.where({ number: retarget.number }),
        {
          data(pullRequest) {
            pullRequest.baseRef = retarget.baseRef;
          },
        },
      );
    },
    { once: true },
  );
}
