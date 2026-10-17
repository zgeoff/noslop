import { loadConfig } from '@noslop/config';
import type { CLIContext } from './cli-context';

// prints the merged config of the repo that holds the working directory, with the file each key
// comes from
export async function runConfigCommand(json: boolean, ctx: CLIContext): Promise<number> {
  const loaded = await loadConfig({ repoDir: ctx.cwd });

  if (json) {
    const output = {
      config: loaded.config,
      sources: loaded.sources,
      chain: loaded.chain,
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

  ctx.writeStdout(`${lines.join('\n')}\n`);

  return 0;
}
