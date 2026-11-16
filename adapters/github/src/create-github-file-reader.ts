import { posix } from 'node:path';
import type { GithubLocation, ReadRemoteFile } from '@noslop/config';
import { match } from 'ts-pattern';
import type { GitHubConnection } from './create-github-connection';

export interface GitHubFileReaderOptions {
  loadConnection: () => Promise<GitHubConnection>;
}

// Linux bounds a path lookup at 40 symlinks, so a link cycle fails at the bound a git read uses.
const MAX_LINK_HOPS = 40;

export function createGitHubFileReader(options: GitHubFileReaderOptions): ReadRemoteFile {
  const readFile = async (location: GithubLocation, hops: number): Promise<string | null> => {
    const connection = await options.loadConnection();
    const entry = await readContentEntry(connection, location, location.path);

    return match(entry)
      .with({ kind: 'file' }, (file) => Promise.resolve<string | null>(file.text))
      .with({ kind: 'link' }, (link) =>
        followLink(location, hops, buildLinkedPath(location.path, link.target, [])),
      )
      .with({ kind: 'missing' }, () => readThroughLinkedFolder(connection, location, hops))
      .with({ kind: 'directory' }, { kind: 'other' }, () => Promise.resolve(null))
      .exhaustive();
  };

  // The contents API answers 404 for a path under a symlinked folder, so look for the link among
  // the path's folders.
  const readThroughLinkedFolder = async (
    connection: GitHubConnection,
    location: GithubLocation,
    hops: number,
  ): Promise<string | null> => {
    const segments = location.path.split('/');

    for (let index = 0; index < segments.length - 1; index += 1) {
      const prefix = segments.slice(0, index + 1).join('/');

      const folder = await readContentEntry(connection, location, prefix);

      if (folder.kind === 'link') {
        const rest = segments.slice(index + 1);

        return followLink(location, hops, buildLinkedPath(prefix, folder.target, rest));
      }

      if (folder.kind !== 'directory') {
        return null;
      }
    }

    return null;
  };

  const followLink = (
    location: GithubLocation,
    hops: number,
    path: string | null,
  ): Promise<string | null> => {
    if (hops >= MAX_LINK_HOPS) {
      throw new Error(
        `${location.owner}/${location.repo}/${location.path} follows too many symlinks`,
      );
    }

    return path === null ? Promise.resolve(null) : readFile({ ...location, path }, hops + 1);
  };

  return (location) => readFile(location, 0);
}

type ContentEntry =
  | { kind: 'file'; text: string }
  | { kind: 'link'; target: string }
  | { kind: 'directory' }
  | { kind: 'other' }
  | { kind: 'missing' };

async function readContentEntry(
  connection: GitHubConnection,
  location: GithubLocation,
  path: string,
): Promise<ContentEntry> {
  try {
    const response = await connection.client.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: location.owner,
      repo: location.repo,
      path,
      ...(location.ref === null ? {} : { ref: location.ref }),
    });

    const data = response.data;

    if (Array.isArray(data)) {
      return { kind: 'directory' };
    }

    if (data.type === 'file' && 'content' in data) {
      return { kind: 'file', text: Buffer.from(data.content, 'base64').toString('utf8') };
    }

    if (data.type === 'symlink' && 'target' in data) {
      return { kind: 'link', target: data.target };
    }

    return { kind: 'other' };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
      return { kind: 'missing' };
    }

    throw error;
  }
}

// The contents API serves only the repo's own files, so a target outside the repo reads as
// missing.
function buildLinkedPath(link: string, target: string, rest: string[]): string | null {
  if (posix.isAbsolute(target)) {
    return null;
  }

  const path = posix.join(posix.dirname(link), target, ...rest);

  return path === '.' || path === '..' || path.startsWith('../') ? null : path;
}
