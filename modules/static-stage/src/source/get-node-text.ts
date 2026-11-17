import type { AnalyzeContext } from './analyze-context';
import type { ASTNode } from './ast-node';

export function getNodeText(node: ASTNode, ctx: AnalyzeContext, maxLength: number): string {
  const text = ctx.parsed.text.slice(node.start, node.end).replaceAll(/\s+/gu, ' ');

  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
