import type { CLIContext } from './cli-context';
import { collectKeySources } from './collect-key-sources';
import { loadRepoConfig } from './load-repo-config';
import { resolveRepoDir } from './resolve-repo-dir';

export async function runConfigCommand(json: boolean, ctx: CLIContext): Promise<number> {
  const repoDir = await resolveRepoDir(ctx);
  const loaded = await loadRepoConfig(ctx, repoDir);

  if (json) {
    const output = {
      config: loaded.config,
      sources: loaded.sources,
      chain: loaded.chain,
      missingRules: loaded.missingRules,
      hash: loaded.hash,
    };

    ctx.writeStdout(`${JSON.stringify(output, null, 2)}\n`);

    return 0;
  }

  const chain = ['built-in', ...loaded.chain];
  const lines = [`config ${loaded.hash}`, `chain: ${chain.join(' > ')}`, ''];

  for (const [key, value] of Object.entries(loaded.config)) {
    const keySources = collectKeySources(loaded.sources, key, chain);

    lines.push(`${key} (${keySources.join(', ')}): ${JSON.stringify(value)}`);
  }

  for (const label of loaded.missingRules) {
    lines.push(`rules file not in this repo, so no rules from it: ${label}`);
  }

  ctx.writeStdout(`${lines.join('\n')}\n`);

  return 0;
}
