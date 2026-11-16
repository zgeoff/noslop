import { HttpResponse, http } from 'msw';
import { githubCollections } from './github-collections';
import { GITHUB_API_URL } from './github-handlers';

interface ContentParams {
  owner: string;
  repo: string;
  path: string;
}

export const githubContentHandlers = [
  http.get<ContentParams>(`${GITHUB_API_URL}/repos/:owner/:repo/contents/:path+`, (info) => {
    const ref = new URL(info.request.url).searchParams.get('ref') ?? 'main';

    const files = githubCollections.files.findMany((query) =>
      query.where({ owner: info.params.owner, repo: info.params.repo, ref }),
    );

    const file = files.find((candidate) => candidate.path === info.params.path);

    if (file === undefined) {
      return buildFolderListing(info.params.path, files);
    }

    if (file.target !== null) {
      return HttpResponse.json({ type: 'symlink', path: file.path, target: file.target });
    }

    return HttpResponse.json({
      type: 'file',
      encoding: 'base64',
      path: file.path,
      content: Buffer.from(file.content).toString('base64'),
    });
  }),
];

// GitHub lists a folder's entries, and answers 404 for a path under a symlinked folder, since the
// path names no entry of the tree.
function buildFolderListing(
  path: string,
  files: readonly { path: string; target: string | null }[],
) {
  const entries = new Map<string, string>();

  for (const file of files) {
    if (!file.path.startsWith(`${path}/`)) {
      continue;
    }

    const [name = '', ...rest] = file.path.slice(path.length + 1).split('/');

    entries.set(name, pickEntryType(rest.length > 0, file.target));
  }

  if (entries.size === 0) {
    return HttpResponse.json(
      { message: 'Not Found', documentation_url: 'https://docs.github.com/rest', status: '404' },
      { status: 404 },
    );
  }

  return HttpResponse.json(
    [...entries].map(([name, type]) => ({ type, name, path: `${path}/${name}` })),
  );
}

function pickEntryType(isFolder: boolean, target: string | null): string {
  if (isFolder) {
    return 'dir';
  }

  return target === null ? 'file' : 'symlink';
}
