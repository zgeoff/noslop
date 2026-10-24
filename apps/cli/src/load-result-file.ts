import { resolve } from 'node:path';
import type { CLIContext } from './cli-context';

export async function loadResultFile(ctx: CLIContext, path: string): Promise<unknown> {
  const file = Bun.file(resolve(ctx.cwd, path));

  const exists = await file.exists();

  if (!exists) {
    throw new Error(`no review result file at ${path}`);
  }

  const text = await file.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`the review result file ${path} is not valid JSON`);
  }
}
