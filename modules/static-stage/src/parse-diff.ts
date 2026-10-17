import type { DiffLine, FileStatus, Hunk } from './types';

export interface ParsedFile {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  binary: boolean;
  hunks: Hunk[];
}

const HUNK_HEADER =
  /^@@ -(?<oldStart>\d+)(?:,(?<oldLines>\d+))? \+(?<newStart>\d+)(?:,(?<newLines>\d+))? @@/u;

// reads the output of `git diff --no-prefix` into one entry per file, each with its hunks and the old
// and new line number of every line
export function parseDiff(diff: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  let file: ParsedFile | null = null;
  let hunk: Hunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = { path: '', oldPath: null, status: 'modified', binary: false, hunks: [] };
      hunk = null;

      files.push(file);
      continue;
    }

    if (file === null) {
      continue;
    }

    if (hunk === null && readHeaderLine(line, file)) {
      continue;
    }

    const header = HUNK_HEADER.exec(line);

    if (header?.groups !== undefined) {
      hunk = {
        oldStart: Number(header.groups['oldStart']),
        oldLines: Number(header.groups['oldLines'] ?? '1'),
        newStart: Number(header.groups['newStart']),
        newLines: Number(header.groups['newLines'] ?? '1'),
        lines: [],
      };

      oldLine = hunk.oldStart;
      newLine = hunk.newStart;

      file.hunks.push(hunk);
      continue;
    }

    if (hunk === null) {
      continue;
    }

    const parsed = readHunkLine(line, oldLine, newLine);

    if (parsed === null) {
      continue;
    }

    hunk.lines.push(parsed);

    oldLine += Number(parsed.oldLine !== null);
    newLine += Number(parsed.newLine !== null);
  }

  return files;
}

function readHeaderLine(line: string, file: ParsedFile): boolean {
  const target = file;

  if (line.startsWith('--- ')) {
    const path = line.slice(4);

    if (path !== '/dev/null') {
      target.oldPath = path;
    }

    return true;
  }

  if (line.startsWith('+++ ')) {
    const path = line.slice(4);

    if (path === '/dev/null') {
      target.status = 'deleted';
      target.path = target.oldPath ?? '';
    } else {
      target.path = path;
    }

    if (target.oldPath === null && target.status !== 'deleted') {
      target.status = 'added';
    }

    return true;
  }

  if (line.startsWith('new file mode')) {
    target.status = 'added';

    return true;
  }

  if (line.startsWith('deleted file mode')) {
    target.status = 'deleted';

    return true;
  }

  if (line.startsWith('rename from ')) {
    target.status = 'renamed';
    target.oldPath = line.slice('rename from '.length);

    return true;
  }

  if (line.startsWith('rename to ')) {
    target.path = line.slice('rename to '.length);

    return true;
  }

  if (line.startsWith('Binary files ')) {
    target.binary = true;
    target.path ||= /and (?<path>.+) differ$/u.exec(line)?.groups?.['path'] ?? '';

    return true;
  }

  return false;
}

function readHunkLine(line: string, oldLine: number, newLine: number): DiffLine | null {
  const marker = line.charAt(0);
  const text = line.slice(1);

  if (marker === '+') {
    return { kind: 'added', text, oldLine: null, newLine };
  }

  if (marker === '-') {
    return { kind: 'deleted', text, oldLine, newLine: null };
  }

  if (marker === ' ') {
    return { kind: 'context', text, oldLine, newLine };
  }

  return null;
}
