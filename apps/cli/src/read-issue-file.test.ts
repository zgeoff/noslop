import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readIssueFile } from './read-issue-file';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-issue-file-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads a relative path from the working directory and trims the text', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'issue.md'), '\nAdd a retry to the upload.\n\n');

  const text = await readIssueFile(ctx.directory, 'issue.md');

  expect(text).toBe('Add a retry to the upload.');
});

test('it rejects a path that names no file', async () => {
  const ctx = await setupTest();

  expect(readIssueFile(ctx.directory, 'missing.md')).rejects.toThrowWithMessage(
    Error,
    '--issue-file names no file: missing.md',
  );
});
