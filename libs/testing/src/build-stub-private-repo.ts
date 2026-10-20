import { HttpResponse, http } from 'msw';
import { GITHUB_API_URL } from './github-handlers';

export interface StubPrivateRepoOptions {
  owner: string;
  repo: string;

  // the one token that may read the repo
  token: string;
}

// a handler that makes one repo of the stand-in private: GitHub answers a request without a token that
// can read a private repo with 404, as if the repo did not exist, and a request with the token falls
// through to the stand-in's own handlers; a test adds it with `githubServer.use`
export function buildStubPrivateRepo(options: StubPrivateRepoOptions) {
  return http.all(`${GITHUB_API_URL}/repos/${options.owner}/${options.repo}/*`, (info) => {
    const [, credential] = (info.request.headers.get('authorization') ?? '').split(' ');

    return credential === options.token
      ? undefined
      : HttpResponse.json(
          {
            message: 'Not Found',
            documentation_url: 'https://docs.github.com/rest',
            status: '404',
          },
          { status: 404 },
        );
  });
}
