import { loadStore, writeEscape } from '@noslop/sqlite';
import type { CLIContext } from './cli-context';
import { getStorePath } from './get-store-path';
import { loadRepoConfig } from './load-repo-config';
import { resolveRepoDir } from './resolve-repo-dir';

export interface EscapeValues {
  repo: string;
  issue: string;
  head: string;
  defect: string;
  lens: string | undefined;
  path: string | undefined;
  lines: string | undefined;
}

const LINES = /^(?<start>\d+)(?:-(?<end>\d+))?$/u;

// records a defect that a review missed in the store, from the issue that reports it and the head of
// the change that caused it; recall per lens counts it, and later reviews of its file read it
export async function runStoreEscapeCommand(
  values: EscapeValues,
  ctx: CLIContext,
): Promise<number> {
  const lines = values.lines === undefined ? null : LINES.exec(values.lines)?.groups;

  if (lines === undefined) {
    throw new Error(`--lines takes a line or a range such as 12-14, not ${values.lines}`);
  }

  if (lines !== null && values.path === undefined) {
    throw new Error('--lines needs --path');
  }

  const start = lines === null ? null : Number(lines['start']);
  const end = lines?.['end'] === undefined ? start : Number(lines['end']);

  const repoDir = await resolveRepoDir(ctx);
  const loaded = await loadRepoConfig(ctx, repoDir);
  const store = await loadStore(getStorePath(loaded.config, ctx));

  try {
    const escapeID = await writeEscape(store, {
      repo: values.repo,
      issue: values.issue,
      head: values.head,
      lens: values.lens ?? null,
      defect: values.defect,
      path: values.path ?? null,
      startLine: start,
      endLine: end,
      recordedAt: (ctx.now?.() ?? new Date()).toISOString(),
    });

    ctx.writeStdout(`noslop: recorded the escape ${escapeID}\n`);
  } finally {
    await store.destroy();
  }

  return 0;
}
