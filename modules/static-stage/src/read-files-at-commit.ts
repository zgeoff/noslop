import { randomUUID } from 'node:crypto';
import type { Runner } from '@noslop/runner';

// reads many files at one commit through a single NUL-delimited `git cat-file --batch`; git answers in
// input order, each file after a header with a fresh marker and each missing path with a `missing`
// line, so the parse knows what each next answer starts with; a path the commit lacks is left out
export async function readFilesAtCommit(
  runner: Runner,
  repoDir: string,
  commit: string,
  paths: readonly string[],
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  if (paths.length === 0) {
    return files;
  }

  const marker = `NOSLOP-${randomUUID()}`;

  const result = await runner.run(['git', 'cat-file', `--batch=${marker} %(objecttype)`, '-Z'], {
    cwd: repoDir,
    stdin: paths.map((path) => `${commit}:${path}\0`).join(''),
  });

  if (result.exitCode !== 0) {
    throw new Error(`git cat-file failed: ${result.stderr.trim()}`);
  }

  const output = result.stdout;
  let cursor = 0;

  for (const [index, path] of paths.entries()) {
    const missing = `${commit}:${path} missing\0`;

    if (output.startsWith(missing, cursor)) {
      cursor += missing.length;
      continue;
    }

    const headerEnd = output.indexOf('\0', cursor);
    const type = output.slice(cursor + marker.length + 1, headerEnd);
    const next = paths[index + 1];

    const contentEnd =
      next === undefined
        ? output.length - 1
        : getNextAnswer(output, headerEnd + 1, marker, `${commit}:${next} missing\0`);

    if (type === 'blob') {
      files.set(path, output.slice(headerEnd + 1, contentEnd));
    }

    cursor = contentEnd + 1;
  }

  return files;
}

function getNextAnswer(output: string, from: number, marker: string, missing: string): number {
  const byMarker = output.indexOf(`\0${marker} `, from);
  const byMissing = output.indexOf(`\0${missing}`, from);
  const found = [byMarker, byMissing].filter((position) => position !== -1);

  return found.length === 0 ? output.length - 1 : Math.min(...found);
}
