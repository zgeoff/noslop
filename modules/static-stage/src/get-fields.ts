import type { ASTNode } from './ast-node';
import { isASTNode } from './ast-node';

// the child nodes of a list field, such as a call's arguments or a block's body
export function getFields(node: ASTNode, field: string): ASTNode[] {
  const value = node[field];

  return Array.isArray(value) ? value.filter((item) => isASTNode(item)) : [];
}
