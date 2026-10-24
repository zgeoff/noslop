import type { ASTNode } from './ast-node';
import { isASTNode } from './ast-node';

export function getFields(node: ASTNode, field: string): ASTNode[] {
  const value = node[field];

  return Array.isArray(value) ? value.filter((item) => isASTNode(item)) : [];
}
