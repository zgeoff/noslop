import type { ASTNode } from './ast-node';
import { isASTNode } from './ast-node';

// visits every node depth-first, with the chain of nodes above it, nearest last
export function collectFromAST(
  root: ASTNode,
  visit: (node: ASTNode, ancestors: readonly ASTNode[]) => void,
): void {
  const stack: { node: ASTNode; ancestors: readonly ASTNode[] }[] = [{ node: root, ancestors: [] }];

  while (stack.length > 0) {
    const entry = stack.pop();

    if (entry === undefined) {
      break;
    }

    visit(entry.node, entry.ancestors);

    const ancestors = [...entry.ancestors, entry.node];
    const children: ASTNode[] = [];

    for (const [key, value] of Object.entries(entry.node)) {
      if (key === 'parent') {
        continue;
      }

      if (Array.isArray(value)) {
        children.push(...value.filter((item) => isASTNode(item)));
      } else if (isASTNode(value)) {
        children.push(value);
      }
    }

    for (const child of children.toReversed()) {
      stack.push({ node: child, ancestors });
    }
  }
}
