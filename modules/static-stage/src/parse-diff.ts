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
      // a patch with no text headers, such as an empty new file or a mode change, names its path
      // only here
      const path = parseHeaderPath(line.slice('diff --git '.length));

      file = { path, oldPath: path, status: 'modified', binary: false, hunks: [] };
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
    const path = parseGitPath(line.slice(4));

    if (path !== '/dev/null') {
      target.oldPath = path;
    }

    return true;
  }

  if (line.startsWith('+++ ')) {
    const path = parseGitPath(line.slice(4));

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
    target.oldPath = null;

    return true;
  }

  if (line.startsWith('deleted file mode')) {
    target.status = 'deleted';

    return true;
  }

  if (line.startsWith('rename from ')) {
    target.status = 'renamed';
    target.oldPath = parseGitPath(line.slice('rename from '.length));

    return true;
  }

  if (line.startsWith('rename to ')) {
    target.path = parseGitPath(line.slice('rename to '.length));

    return true;
  }

  if (line.startsWith('Binary files ')) {
    target.binary = true;
    target.path ||= /and (?<path>.+) differ$/u.exec(line)?.groups?.['path'] ?? '';

    return true;
  }

  return false;
}

// the header names the path twice; with no prefixes, an unrenamed path splits the rest in 2 equal
// halves, and a quoted path ends at its closing quote
function parseHeaderPath(rest: string): string {
  if (rest.startsWith('"')) {
    const end = findClosingQuote(rest);

    return parseGitPath(rest.slice(0, end + 1));
  }

  const half = (rest.length - 1) / 2;

  if (Number.isInteger(half) && rest.slice(0, half) === rest.slice(half + 1)) {
    return rest.slice(0, half);
  }

  return rest.slice(0, rest.indexOf(' '));
}

const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '"': '"',
  '\\': '\\',
  a: '\u0007',
  b: '\b',
  f: '\f',
  v: '\v',
};

// git ends a path that holds a space with a tab, and quotes a path that holds a special character,
// with C escapes and octal bytes for the rest
function parseGitPath(raw: string): string {
  const path = raw.endsWith('\t') ? raw.slice(0, -1) : raw;

  if (!path.startsWith('"') || !path.endsWith('"') || path.length < 2) {
    return path;
  }

  const bytes: number[] = [];

  const encoder = new TextEncoder();

  const body = path.slice(1, -1);

  for (let index = 0; index < body.length; index += 1) {
    const char = body.charAt(index);

    if (char !== '\\') {
      bytes.push(...encoder.encode(char));
      continue;
    }

    const octal = /^[0-7]{3}/u.exec(body.slice(index + 1))?.[0];

    if (octal === undefined) {
      const next = body.charAt(index + 1);

      bytes.push(...encoder.encode(ESCAPES[next] ?? next));

      index += 1;
    } else {
      bytes.push(Number.parseInt(octal, 8));

      index += 3;
    }
  }

  return new TextDecoder().decode(new Uint8Array(bytes));
}

function findClosingQuote(text: string): number {
  for (let index = 1; index < text.length; index += 1) {
    if (text.charAt(index) === '\\') {
      index += 1;
    } else if (text.charAt(index) === '"') {
      return index;
    }
  }

  return text.length - 1;
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
