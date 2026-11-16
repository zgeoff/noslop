import { posix, relative, sep } from 'node:path';
import type { LoadedConfig, ReadLocalFile } from '@noslop/config';
import { MissingConfigFileError, loadConfig } from '@noslop/config';
import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from '@noslop/github';
import { createGitHubFileReader, readGitHubEntry } from '@noslop/github';
import { match } from 'ts-pattern';
import { formatOutsideFiles } from './format-outside-files';
import { MAX_LINK_HOPS } from './max-link-hops';

export interface OutsideFile {
  path: string;
  linkTarget: string | null;
}

export interface CommitConfig {
  loaded: LoadedConfig;
  outsideFiles: OutsideFile[];
}

const BASE_BRANCH_DIR = '/base-branch';

type CommitRead =
  | { kind: 'text'; text: string }
  | { kind: 'missing' }
  | { kind: 'outside'; file: OutsideFile };

export async function loadCommitConfig(
  loadConnection: () => Promise<GitHubConnection>,
  pr: PullRequestRef,
  commit: string,
): Promise<CommitConfig> {
  const outsideReads = new Map<string, OutsideFile>();

  const reads: Promise<string | null>[] = [];

  const readCommitPath = async (
    path: string,
    link: string | null,
    hops: number,
  ): Promise<CommitRead> => {
    if (isOutsideRepo(path)) {
      const file: OutsideFile =
        link === null ? { path, linkTarget: null } : { path: link, linkTarget: path };

      return { kind: 'outside', file };
    }

    const connection = await loadConnection();

    const entry = await readGitHubEntry(connection, {
      kind: 'github',
      owner: pr.owner,
      repo: pr.repo,
      path,
      ref: commit,
    });

    return match(entry)
      .with({ kind: 'file' }, (file): CommitRead => ({ kind: 'text', text: file.text }))
      .with({ kind: 'missing' }, { kind: 'folder' }, (): CommitRead => ({ kind: 'missing' }))
      .with({ kind: 'link' }, (found) => {
        if (hops >= MAX_LINK_HOPS) {
          throw new Error(`the config file ${link ?? path} follows too many symlinks in ${commit}`);
        }

        return readCommitPath(resolveLinkTarget(path, found.target), link ?? path, hops + 1);
      })
      .exhaustive();
  };

  const readLocalFile: ReadLocalFile = (path) => {
    const inner = relative(BASE_BRANCH_DIR, path);

    if (inner === '') {
      return Promise.resolve(null);
    }

    const readText = async (): Promise<string | null> => {
      const result = await readCommitPath(inner.split(sep).join('/'), null, 0);

      return match(result)
        .with({ kind: 'text' }, (found) => found.text)
        .with({ kind: 'missing' }, () => null)
        .with({ kind: 'outside' }, (found) => {
          outsideReads.set(path, found.file);

          return null;
        })
        .exhaustive();
    };

    const read = readText();

    reads.push(read);

    return read;
  };

  try {
    const loaded = await loadConfig({
      repoDir: BASE_BRANCH_DIR,
      readRemoteFile: createGitHubFileReader({ loadConnection }),
      readLocalFile,
    });

    return { loaded, outsideFiles: [...outsideReads.values()] };
  } catch (error) {
    if (!isMissingOutsideFile(error, outsideReads)) {
      throw error;
    }

    // The config loader stops at the first missing file while its other reads still run, so the
    // refusal waits for them to name every file outside the repo.
    await Promise.allSettled(reads);

    throw new Error(
      `the config at ${commit.slice(0, 12)} reads files outside the repo, which GitHub cannot serve: ${formatOutsideFiles([...outsideReads.values()])}`,
      { cause: error },
    );
  }
}

function isOutsideRepo(path: string): boolean {
  return posix.isAbsolute(path) || path === '..' || path.startsWith('../');
}

function resolveLinkTarget(link: string, target: string): string {
  return posix.isAbsolute(target) ? target : posix.join(posix.dirname(link), target);
}

function isMissingOutsideFile(
  error: unknown,
  outsideReads: ReadonlyMap<string, OutsideFile>,
): boolean {
  return (
    error instanceof MissingConfigFileError &&
    error.location.kind === 'local' &&
    outsideReads.has(error.location.path)
  );
}
