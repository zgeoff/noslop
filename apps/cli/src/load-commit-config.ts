import { isAbsolute, relative, sep } from 'node:path';
import type { ConfigLocation, GithubLocation, LoadedConfig, ReadLocalFile } from '@noslop/config';
import { MissingConfigFileError, loadConfig } from '@noslop/config';
import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from '@noslop/github';
import { createGitHubFileReader, toFileText } from '@noslop/github';
import { match } from 'ts-pattern';
import { formatOutsideLinks } from './format-outside-links';

export interface OutsideLink {
  path: string;
  link: string;
  target: string;
}

export interface CommitConfig {
  loaded: LoadedConfig;
  outsideLinks: OutsideLink[];
}

const BASE_BRANCH_DIR = '/base-branch';

export async function loadCommitConfig(
  loadConnection: () => Promise<GitHubConnection>,
  pr: PullRequestRef,
  commit: string,
): Promise<CommitConfig> {
  const readGitHubFile = createGitHubFileReader({ loadConnection });

  const outsideLinks = new Map<string, OutsideLink>();

  const reads: Promise<string | null>[] = [];

  const readFile = async (
    location: GithubLocation,
    key: string,
    path: string,
  ): Promise<string | null> => {
    const read = await readGitHubFile(location);

    if (read.kind === 'outside') {
      outsideLinks.set(key, { path, link: read.link, target: read.target });
    }

    return toFileText(read);
  };

  const readLocalFile: ReadLocalFile = (path) => {
    const inner = relative(BASE_BRANCH_DIR, path);

    if (inner === '' || isAbsolute(inner) || inner.split(sep)[0] === '..') {
      return Promise.resolve(null);
    }

    const innerPath = inner.split(sep).join('/');

    const read = readFile(
      { kind: 'github', owner: pr.owner, repo: pr.repo, path: innerPath, ref: commit },
      path,
      innerPath,
    );

    reads.push(read);

    return read;
  };

  try {
    const loaded = await loadConfig({
      repoDir: BASE_BRANCH_DIR,
      readRemoteFile: (location) => {
        const read = readFile(
          location,
          buildReadKey(location),
          `github:${location.owner}/${location.repo}/${location.path}`,
        );

        reads.push(read);

        return read;
      },
      readLocalFile,
    });

    return { loaded, outsideLinks: [...outsideLinks.values()] };
  } catch (error) {
    if (!(error instanceof MissingConfigFileError)) {
      throw error;
    }

    // The config loader stops at the first missing file while its other reads still run, so wait
    // for them to name every link that leaves the repo.
    await Promise.allSettled(reads);

    if (outsideLinks.size === 0) {
      throw error;
    }

    const named = `the config at ${commit.slice(0, 12)} ${formatOutsideLinks([...outsideLinks.values()])}`;

    const message = outsideLinks.has(buildReadKey(error.location))
      ? named
      : `${error.message}; ${named}`;

    throw new Error(message, { cause: error });
  }
}

function buildReadKey(location: ConfigLocation): string {
  return match(location)
    .with({ kind: 'local' }, (local) => local.path)
    .with(
      { kind: 'github' },
      (remote) => `github:${remote.owner}/${remote.repo}/${remote.path}@${remote.ref ?? ''}`,
    )
    .exhaustive();
}
