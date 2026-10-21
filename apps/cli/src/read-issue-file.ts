import { resolve } from 'node:path';

// a relative path resolves against the working directory, as the shell that passed it does
export async function readIssueFile(cwd: string, path: string): Promise<string> {
  const file = Bun.file(resolve(cwd, path));

  const exists = await file.exists();

  if (!exists) {
    throw new Error(`--issue-file names no file: ${path}`);
  }

  const text = await file.text();

  return text.trim();
}
