import { isAbsolute, relative, sep } from 'node:path';
import type { LoadedConfig, ReadLocalFile } from '@noslop/config';
import { MissingConfigFileError, loadConfig } from '@noslop/config';
import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from '@noslop/github';
import { createGitHubFileReader, toFileText } from '@noslop/github';
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

  const readCommitFile = async (path: string, inner: string): Promise<string | null> => {
    const read = await readGitHubFile({
      kind: 'github',
      owner: pr.owner,
      repo: pr.repo,
      path: inner,
      ref: commit,
    });

    if (read.kind === 'outside') {
      outsideLinks.set(path, { path: inner, link: read.link, target: read.target });
    }

    return toFileText(read);
  };

  const readLocalFile: ReadLocalFile = (path) => {
    const inner = relative(BASE_BRANCH_DIR, path);

    if (inner === '' || isAbsolute(inner) || inner.split(sep)[0] === '..') {
      return Promise.resolve(null);
    }

    const read = readCommitFile(path, inner.split(sep).join('/'));

    reads.push(read);

    return read;
  };

  try {
    const loaded = await loadConfig({
      repoDir: BASE_BRANCH_DIR,
      readRemoteFile: async (location) => {
        const read = await readGitHubFile(location);

        return toFileText(read);
      },
      readLocalFile,
    });

    return { loaded, outsideLinks: [...outsideLinks.values()] };
  } catch (error) {
    if (
      !(error instanceof MissingConfigFileError) ||
      error.location.kind !== 'local' ||
      !outsideLinks.has(error.location.path)
    ) {
      throw error;
    }

    // The config loader stops at the first missing file while its other reads still run, so wait
    // for them to name every link that leaves the repo.
    await Promise.allSettled(reads);

    throw new Error(
      `the config at ${commit.slice(0, 12)} ${formatOutsideLinks([...outsideLinks.values()])}`,
      { cause: error },
    );
  }
}
