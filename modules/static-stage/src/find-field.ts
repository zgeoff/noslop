import type { ASTNode } from './ast-node';
import { isASTNode } from './ast-node';

export function findField(node: ASTNode, field: string): ASTNode | null {
  const value = node[field];

  return isASTNode(value) ? value : null;
}
