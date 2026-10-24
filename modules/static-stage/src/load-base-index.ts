import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReviewConfig } from '@noslop/contract';
import type { Runner } from '@noslop/runner';
import { z } from 'zod';
import { collectSourceFacts } from './collect-source-facts';
import { isGlobMatch } from './is-glob-match';
import { parseSource } from './parse-source';
import { pickFileKind } from './pick-file-kind';
import { readFilesAtCommit } from './read-files-at-commit';

const locationSchema = z.strictObject({ path: z.string(), startLine: z.int(), endLine: z.int() });

const baseFunctionSchema = z.strictObject({
  name: z.string(),
  location: locationSchema,
  fingerprint: z.array(z.string()),
});

const baseIndexSchema = z.array(baseFunctionSchema);

export type BaseFunction = z.infer<typeof baseFunctionSchema>;

export interface LoadBaseIndexOptions {
  runner: Runner;
  repoDir: string;
  base: string;
  config: ReviewConfig;
  cacheDir: string | null;
}

export async function loadBaseIndex(options: LoadBaseIndexOptions): Promise<BaseFunction[]> {
  const key = new Bun.CryptoHasher('sha256')
    .update(`${options.base}\n${JSON.stringify(options.config.stack)}`)
    .digest('hex')
    .slice(0, 24);

  const cachePath =
    options.cacheDir === null ? null : join(options.cacheDir, `base-index-${key}.json`);

  const cached = cachePath === null ? null : await readFile(cachePath, 'utf8').catch(() => null);

  if (cached !== null) {
    return baseIndexSchema.parse(JSON.parse(cached));
  }

  const listing = await options.runner.run(
    ['git', 'ls-tree', '-r', '--name-only', '-z', options.base],
    { cwd: options.repoDir },
  );

  if (listing.exitCode !== 0) {
    throw new Error(`git ls-tree failed: ${listing.stderr.trim()}`);
  }

  const paths = listing.stdout
    .split('\0')
    .filter(
      (path) =>
        path !== '' &&
        pickFileKind(path, options.config) === 'code' &&
        !isGlobMatch(path, options.config.generated),
    );

  const texts = await readFilesAtCommit(options.runner, options.repoDir, options.base, paths);

  const index: BaseFunction[] = [];

  for (const [path, text] of texts) {
    const parsed = parseSource(path, text);

    if (parsed === null) {
      continue;
    }

    const analysis = collectSourceFacts(parsed, options.config.stack);

    for (const facts of analysis.functions) {
      if (facts.exported) {
        index.push({
          name: facts.name,
          location: { path, startLine: facts.startLine, endLine: facts.endLine },
          fingerprint: [...new Set([...facts.calls, ...facts.literals])],
        });
      }
    }
  }

  // the index lands under a name of its own and then moves into place, so a review that runs at the
  // same time never reads a part-written cache file
  if (options.cacheDir !== null && cachePath !== null) {
    const partPath = `${cachePath}.${crypto.randomUUID()}.part`;

    await mkdir(options.cacheDir, { recursive: true });
    await writeFile(partPath, JSON.stringify(index));
    await rename(partPath, cachePath);
  }

  return index;
}
