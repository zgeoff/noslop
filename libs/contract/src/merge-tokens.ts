import type { Tokens } from './tokens';

// adds up what several calls or reviews spent, count by count
export function mergeTokens(parts: readonly Tokens[]): Tokens {
  return {
    input: parts.reduce((total, part) => total + part.input, 0),
    cachedInput: parts.reduce((total, part) => total + part.cachedInput, 0),
    cacheWrite: parts.reduce((total, part) => total + part.cacheWrite, 0),
    output: parts.reduce((total, part) => total + part.output, 0),
  };
}
