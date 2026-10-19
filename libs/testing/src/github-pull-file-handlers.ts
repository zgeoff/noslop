import { HttpResponse, http } from 'msw';
import { githubCollections } from './github-collections';
import { GITHUB_API_URL } from './github-handlers';
import { toPage } from './to-page';

// the files of a pull request's diff, in pages, as GitHub lists them
export const githubPullFileHandlers = [
  http.get<{ owner: string; repo: string; number: string }>(
    `${GITHUB_API_URL}/repos/:owner/:repo/pulls/:number/files`,
    (info) => {
      const files = githubCollections.pullFiles.findMany((query) =>
        query.where({
          owner: info.params.owner,
          repo: info.params.repo,
          number: Number(info.params.number),
        }),
      );

      return HttpResponse.json(
        toPage(info.request, files).map((file) => ({
          filename: file.path,
          status: 'modified' as const,
        })),
      );
    },
  ),
];
