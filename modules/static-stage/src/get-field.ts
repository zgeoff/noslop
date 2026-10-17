import type { ASTNode } from './ast-node';
import { isASTNode } from './ast-node';

// a child node of the given field, or null when the field holds no node
export function getField(node: ASTNode, field: string): ASTNode | null {
  const value = node[field];

  return isASTNode(value) ? value : null;
}
