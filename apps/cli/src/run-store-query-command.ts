import { loadConfig } from '@noslop/config';
import type { StoreQueryName } from '@noslop/sqlite';
import { STORE_QUERY_NAMES, loadStore, runStoreQuery } from '@noslop/sqlite';
import type { CLIContext } from './cli-context';
import { getStorePath } from './get-store-path';

// runs one named query on the store that the config's sqlite reporter writes, and prints its rows
export async function runStoreQueryCommand(
  name: string | undefined,
  json: boolean,
  ctx: CLIContext,
): Promise<number> {
  const query = STORE_QUERY_NAMES.find((candidate) => candidate === name);

  if (query === undefined) {
    throw new Error(`name a store query: ${STORE_QUERY_NAMES.join(', ')}`);
  }

  const loaded = await loadConfig({ repoDir: ctx.cwd });
  const store = await loadStore(getStorePath(loaded.config, ctx));

  try {
    const rows = await runStoreQuery(store, query);

    const output = json ? `${JSON.stringify(rows, null, 2)}\n` : formatRows(query, rows);

    ctx.writeStdout(output);
  } finally {
    await store.destroy();
  }

  return 0;
}

function formatRows(query: StoreQueryName, rows: readonly Record<string, unknown>[]): string {
  const lines = [`${query}: ${rows.length} rows`];

  for (const row of rows) {
    lines.push(
      Object.entries(row)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join('  '),
    );
  }

  return `${lines.join('\n')}\n`;
}
