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

// a reply to a finding that lands while noslop publishes: the first edit of an issue comment, such
// as the summary, adds the reply, then the stand-in's own handler serves the edit
export function buildStubReplyDuringWrite(reply: StubReply) {
  return http.patch(
    `${GITHUB_API_URL}/repos/:owner/:repo/issues/comments/:commentID`,
    async () => {
      await githubCollections.reviewComments.create(reply);
    },
    { once: true },
  );
}
