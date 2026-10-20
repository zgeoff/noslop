import type { StoreQueryFilters, StoreQueryName } from '@noslop/sqlite';
import { STORE_QUERY_NAMES, loadStore, runStoreQuery } from '@noslop/sqlite';
import cliPackage from '../package.json' with { type: 'json' };
import type { CLIContext } from './cli-context';
import { getStorePath } from './get-store-path';
import { loadRepoConfig } from './load-repo-config';
import { resolveRepoDir } from './resolve-repo-dir';

export interface StoreQueryValues {
  name: string | undefined;
  json: boolean;
  repo: string | undefined;
  pr: string | undefined;
  since: string | undefined;
}

// runs one named query on the store that the config's sqlite reporter writes, and prints its rows
export async function runStoreQueryCommand(
  values: StoreQueryValues,
  ctx: CLIContext,
): Promise<number> {
  const query = STORE_QUERY_NAMES.find((candidate) => candidate === values.name);

  if (query === undefined) {
    throw new Error(`name a store query: ${STORE_QUERY_NAMES.join(', ')}`);
  }

  const filters = parseFilters(values);

  if (query !== 'findings-by-pr' && Object.keys(filters).length > 0) {
    throw new Error('--repo, --pr and --since apply only to findings-by-pr');
  }

  const repoDir = await resolveRepoDir(ctx);
  const loaded = await loadRepoConfig(ctx, repoDir);

  const store = await loadStore(getStorePath(loaded.config, ctx), {
    version: cliPackage.version,
  });

  try {
    const rows = await runStoreQuery(store, query, filters);

    const output = values.json ? `${JSON.stringify(rows, null, 2)}\n` : formatRows(query, rows);

    ctx.writeStdout(output);
  } finally {
    await store.destroy();
  }

  return 0;
}

const PULL_REQUEST = /^[1-9]\d*$/u;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/u;

// the filters the flags give; a time with an offset turns to UTC, the form the store's times take, so
// the query compares them as text
function parseFilters(values: StoreQueryValues): StoreQueryFilters {
  const filters: StoreQueryFilters = {};

  if (values.repo !== undefined) {
    filters.repo = values.repo;
  }

  if (values.pr !== undefined) {
    if (!PULL_REQUEST.test(values.pr)) {
      throw new Error(`--pr takes a pull request number, not ${values.pr}`);
    }

    filters.pullRequest = Number(values.pr);
  }

  if (values.since !== undefined) {
    const since = new Date(values.since);

    if (!ISO_TIME.test(values.since) || Number.isNaN(since.getTime())) {
      throw new Error(
        `--since takes an ISO time such as 2026-10-01T00:00:00Z, not ${values.since}`,
      );
    }

    filters.since = since.toISOString();
  }

  return filters;
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
