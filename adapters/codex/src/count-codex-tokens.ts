import type { Tokens } from '@noslop/contract';
import { mergeTokens } from '@noslop/contract';
import { z } from 'zod';
import { buildTokensFromCodexUsage, codexUsageSchema } from './build-tokens-from-codex-usage';

const turnSchema = z.looseObject({ type: z.literal('turn.completed'), usage: codexUsageSchema });

// Codex prints one JSON event per line, and each finished turn reports its token use
export function countCodexTokens(stdout: string): Tokens {
  const turns = stdout
    .split('\n')
    .map((line) => turnSchema.safeParse(parseJSONLine(line)))
    .flatMap((event) => (event.success ? [buildTokensFromCodexUsage(event.data.usage)] : []));

  return mergeTokens(turns);
}

function parseJSONLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
