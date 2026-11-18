import type { AnalyzeContext } from './analyze-context';
import type { ASTNode } from './ast-node';

export function findEnclosingFunction(
  ancestors: readonly ASTNode[],
  ctx: AnalyzeContext,
): number | null {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    const found = ancestor === undefined ? undefined : ctx.functionIndex.get(ancestor);

    if (found !== undefined) {
      return found;
    }
  }

  return null;
}
