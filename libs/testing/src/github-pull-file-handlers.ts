import type { Endpoints } from '@octokit/types';
import { HttpResponse, http } from 'msw';
import { githubCollections } from './github-collections';
import { GITHUB_API_URL } from './github-handlers';
import { toPage } from './to-page';

interface PullParams {
  owner: string;
  repo: string;
  number: string;
}

// GitHub lists at most 3,000 files of a pull request
const LISTED_FILES = 3000;

export const githubPullFileHandlers = [
  http.get<PullParams>(`${GITHUB_API_URL}/repos/:owner/:repo/pulls/:number`, (info) => {
    const pull = githubCollections.pullRequests.findFirst((query) =>
      query.where({
        owner: info.params.owner,
        repo: info.params.repo,
        number: Number(info.params.number),
      }),
    );

    if (pull === undefined) {
      return HttpResponse.json(
        { message: 'Not Found', documentation_url: 'https://docs.github.com/rest', status: '404' },
        { status: 404 },
      );
    }

    const files = githubCollections.pullFiles.findMany((query) =>
      query.where({ owner: pull.owner, repo: pull.repo, number: pull.number }),
    );

    return HttpResponse.json({
      number: pull.number,
      title: pull.title,
      body: pull.body,
      base: { ref: pull.baseRef, sha: pull.baseSha },
      head: { sha: pull.headSha },
      user: { login: pull.authorLogin },
      changed_files: files.length,
    });
  }),

  http.get<PullParams>(`${GITHUB_API_URL}/repos/:owner/:repo/pulls/:number/files`, (info) => {
    const files = githubCollections.pullFiles.findMany((query) =>
      query.where({
        owner: info.params.owner,
        repo: info.params.repo,
        number: Number(info.params.number),
      }),
    );

    return HttpResponse.json(
      toPage(info.request, files.slice(0, LISTED_FILES)).map((file) => toPullFileData(file)),
    );
  }),
];

type PullFileData = Pick<
  Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}/files']['response']['data'][number],
  'filename' | 'status' | 'sha' | 'previous_filename' | 'patch'
>;

type PullFileRecord = ReturnType<typeof githubCollections.pullFiles.all>[number];

function toPullFileData(file: PullFileRecord): PullFileData {
  const data: PullFileData = { filename: file.path, status: file.status, sha: file.blobSha };

  if (file.previousPath !== null) {
    data.previous_filename = file.previousPath;
  }

  if (file.patch !== null) {
    data.patch = file.patch;
  }

  return data;
}
