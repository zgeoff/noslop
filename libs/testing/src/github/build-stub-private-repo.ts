import { HttpResponse, http } from 'msw';
import { GITHUB_API_URL } from './github-handlers';

export interface StubPrivateRepoOptions {
  owner: string;
  repo: string;

  token: string;
}

// GitHub answers a request without a token that can read a private repo with 404, as if the repo
// did not exist.
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
