import { isAbsolute, join, posix, relative, sep } from 'node:path';
import type { LoadedConfig, ReadLocalFile } from '@noslop/config';
import { loadConfig } from '@noslop/config';
import { createGitHubFileReader } from '@noslop/github';
import type { Runner } from '@noslop/runner';
import type { CLIContext } from './cli-context';

export interface RepoConfigOptions {
  rulesRepoDir?: string;

  commit?: string;
}

export function loadRepoConfig(
  ctx: CLIContext,
  repoDir: string,
  options: RepoConfigOptions = {},
): Promise<LoadedConfig> {
  return loadConfig({
    repoDir,
    readRemoteFile: createGitHubFileReader({ loadConnection: ctx.loadGitHubConnection }),
    ...(options.rulesRepoDir === undefined ? {} : { rulesRepoDir: options.rulesRepoDir }),
    ...(options.commit === undefined
      ? {}
      : { readLocalFile: makeCommitFileReader(ctx.runner, repoDir, options.commit) }),
  });
}

// Linux bounds a path lookup at 40 symlinks, so a link cycle fails at the same bound.
const MAX_LINK_HOPS = 40;

function makeCommitFileReader(runner: Runner, repoDir: string, commit: string): ReadLocalFile {
  const readCommitFile = async (path: string, hops: number): Promise<string | null> => {
    const inner = relative(repoDir, path);
    const segments = inner.split(sep);

    if (isAbsolute(inner) || segments[0] === '..') {
      const file = Bun.file(path);

      const exists = await file.exists();

      return exists ? file.text() : null;
    }

    for (const [index, segment] of segments.entries()) {
      const prefix = [...segments.slice(0, index), segment].join('/');

      const entry = await readTreeEntry(runner, repoDir, commit, prefix);

      if (entry === null) {
        return null;
      }

      if (entry.mode === '120000') {
        if (hops >= MAX_LINK_HOPS) {
          throw new Error(`the config file ${inner} follows too many symlinks in ${commit}`);
        }

        const target = await readBlob(runner, repoDir, entry.object);

        const resolved = isAbsolute(target)
          ? target
          : join(repoDir, posix.join(posix.dirname(prefix), target), ...segments.slice(index + 1));

        return readCommitFile(resolved, hops + 1);
      }

      if (index === segments.length - 1) {
        return entry.type === 'blob' ? readBlob(runner, repoDir, entry.object) : null;
      }
    }

    return null;
  };

  return (path) => readCommitFile(path, 0);
}

interface TreeEntry {
  mode: string;
  type: string;
  object: string;
}

async function readTreeEntry(
  runner: Runner,
  repoDir: string,
  commit: string,
  path: string,
): Promise<TreeEntry | null> {
  const result = await runner.run(['git', 'ls-tree', '-z', commit, '--', path], { cwd: repoDir });

  if (result.exitCode !== 0) {
    throw new Error(`git ls-tree ${commit} failed: ${result.stderr.trim()}`);
  }

  const [meta] = result.stdout.split('\t');
  const [mode, type, object] = (meta ?? '').split(' ');

  return mode === undefined || type === undefined || object === undefined || object === ''
    ? null
    : { mode, type, object };
}

async function readBlob(runner: Runner, repoDir: string, object: string): Promise<string> {
  const result = await runner.run(['git', 'cat-file', 'blob', object], { cwd: repoDir });

  if (result.exitCode !== 0) {
    throw new Error(`git cat-file blob ${object} failed: ${result.stderr.trim()}`);
  }

  return result.stdout;
}
