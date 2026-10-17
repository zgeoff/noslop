import type { CLIContext } from './cli-context';
import { loadRepoConfig } from './load-repo-config';
import { resolveRepoDir } from './resolve-repo-dir';

// prints the merged config of the repo that holds the working directory, with the file each key
// comes from
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

  const lines = [
    `config ${loaded.hash}`,
    `chain: ${['built-in', ...loaded.chain].join(' > ')}`,
    '',
  ];

  for (const [key, value] of Object.entries(loaded.config)) {
    lines.push(`${key} (${loaded.sources[key] ?? 'built-in'}): ${JSON.stringify(value)}`);
  }

  // a rules file the repo lacks loads no rule without failing, so the command names each one
  for (const label of loaded.missingRules) {
    lines.push(`rules file not in this repo, so no rules from it: ${label}`);
  }

  ctx.writeStdout(`${lines.join('\n')}\n`);

  return 0;
}
