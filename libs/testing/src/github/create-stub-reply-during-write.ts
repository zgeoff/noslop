import { http } from 'msw';
import { githubCollections } from './github-collections';
import { GITHUB_API_URL } from './github-handlers';

export interface StubReply {
  owner: string;
  repo: string;
  number: number;
  body: string;
  authorLogin: string;
  inReplyToID: number | null;
}

export function createStubReplyDuringWrite(reply: StubReply) {
  return http.patch(
    `${GITHUB_API_URL}/repos/:owner/:repo/issues/comments/:commentID`,
    async () => {
      await githubCollections.reviewComments.create(reply);
    },
    { once: true },
  );
}
