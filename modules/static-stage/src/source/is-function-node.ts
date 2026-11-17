import type { ASTNode } from './ast-node';

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

export function isFunctionNode(node: ASTNode): boolean {
  return FUNCTION_TYPES.has(node.type);
}
