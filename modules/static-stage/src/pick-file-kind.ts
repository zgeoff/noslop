import type { ReviewConfig } from '@noslop/contract';
import { isGlobMatch } from './is-glob-match';
import type { FileKind } from './types';

const CODE_EXTENSION =
  /\.(?:[cm]?[jt]sx?|py|go|rs|rb|java|kt|swift|c|cc|cpp|h|hpp|cs|php|scala|sh|bash|zsh|sql|lua|ex|exs|zig)$/u;

const TEST_PATH =
  /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:__tests__|e2e|evals)\/|_test\.(?:go|py)$)/u;

const CONFIG_EXTENSION = /\.(?:json|jsonc|ya?ml|toml|ini|env|conf)$/u;

// an agent instruction file is also Markdown, so instruction files match before prose
export function pickFileKind(path: string, config: ReviewConfig): FileKind {
  if (isGlobMatch(path, config.instructions)) {
    return 'instructions';
  }

  if (isGlobMatch(path, config.infra)) {
    return 'infra';
  }

  if (isGlobMatch(path, config.prose)) {
    return 'prose';
  }

  if (CODE_EXTENSION.test(path)) {
    return TEST_PATH.test(path) ? 'test' : 'code';
  }

  if (CONFIG_EXTENSION.test(path)) {
    return 'config';
  }

  return 'other';
}
