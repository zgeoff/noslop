import type { ReviewConfig } from '@noslop/contract';
import type { Runner } from '@noslop/runner';
import { isGlobMatch } from './is-glob-match';
import { parseDiff } from './parse-diff';
import { pickFileKind } from './pick-file-kind';
import type { Change, ChangedFile } from './types';

export interface ReadChangeOptions {
  runner: Runner;
  repoDir: string;
  base: string;
  head: string;
  config: ReviewConfig;

  // the merge base of a pull request whose base is an earlier head of it; the change keeps only the
  // files the pull request changes since its merge base, so a merge from the base branch brings in no
  // file the pull request never touched
  mergeBase?: string;
}

// reads the change between 2 commits through git, resolving each ref to its full commit so every line
// reference cites a pinned commit; the files the config marks generated, lockfiles among them, are
// left out of the change and listed apart
export async function readChange(options: ReadChangeOptions): Promise<Change> {
  const base = await resolveCommit(options, options.base);
  const head = await resolveCommit(options, options.head);
  const owned = await readOwnedPaths(options, head);

  const diff = await runGit(options, [
    '-c',
    'core.quotePath=false',
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--no-prefix',
    '--find-renames',
    '--unified=3',
    base,
    head,
  ]);

  const files: ChangedFile[] = [];
  const excluded: string[] = [];
  const baseOnly: ChangedFile[] = [];

  for (const parsed of parseDiff(diff)) {
    // a generated file is never read, whichever side changes it, so it stays out of the left-out files
    if (isGlobMatch(parsed.path, options.config.generated)) {
      excluded.push(parsed.path);
      continue;
    }

    const lines = parsed.hunks.flatMap((hunk) => hunk.lines);
    const kind = pickFileKind(parsed.path, options.config);

    // a rename keeps either side the pull request changes, so a deletion of its own survives a rename
    // whose new path only the base branch changed
    if (owned !== null && !owned.has(parsed.path) && !owned.has(parsed.oldPath ?? parsed.path)) {
      baseOnly.push({
        ...parsed,
        kind,
        addedLines: lines.filter((line) => line.kind === 'added').length,
        deletedLines: lines.filter((line) => line.kind === 'deleted').length,
      });

      continue;
    }

    // a script with no extension, such as an executable in a bin folder, names its language in its
    // first line, which a hunk can leave out, so the stage reads it from the committed file
    const commit = parsed.status === 'deleted' ? base : head;
    const isScript = kind === 'other' ? await probeShebang(options, commit, parsed.path) : false;

    files.push({
      ...parsed,
      kind: isScript ? 'code' : kind,
      addedLines: lines.filter((line) => line.kind === 'added').length,
      deletedLines: lines.filter((line) => line.kind === 'deleted').length,
    });
  }

  return { base, head, files, excluded, ...(owned === null ? {} : { baseOnly }) };
}

async function resolveCommit(options: ReadChangeOptions, ref: string): Promise<string> {
  const sha = await runGit(options, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${ref}^{commit}`,
  ]);

  return sha.trim();
}

async function runGit(options: ReadChangeOptions, args: readonly string[]): Promise<string> {
  const result = await options.runner.run(['git', ...args], { cwd: options.repoDir });

  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout;
}

// the paths the pull request changes since its merge base, both paths of a rename among them, or null
// with no merge base; the filter runs on the parsed diff, since a pathspec on the diff would stop git
// pairing a rename whose old path the list leaves out
async function readOwnedPaths(
  options: ReadChangeOptions,
  head: string,
): Promise<Set<string> | null> {
  if (options.mergeBase === undefined) {
    return null;
  }

  const listed = await runGit(options, [
    '-c',
    'core.quotePath=false',
    'diff',
    '--name-only',
    '-z',
    '--no-ext-diff',
    '--no-renames',
    options.mergeBase,
    head,
  ]);

  return new Set(listed.split('\0').filter((path) => path !== ''));
}

async function probeShebang(
  options: ReadChangeOptions,
  commit: string,
  path: string,
): Promise<boolean> {
  const result = await options.runner.run(['git', 'cat-file', 'blob', `${commit}:${path}`], {
    cwd: options.repoDir,
  });

  return result.exitCode === 0 && result.stdout.startsWith('#!');
}
