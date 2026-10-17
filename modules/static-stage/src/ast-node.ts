// one node of the oxc syntax tree, read through its type, its span and its own fields; the walkers read
// fields through the guards below instead of the generated node types, so one walker serves every node
export interface ASTNode {
  type: string;
  start: number;
  end: number;
  [field: string]: unknown;
}

export function isASTNode(value: unknown): value is ASTNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'type') === 'string' &&
    typeof Reflect.get(value, 'start') === 'number'
  );
}
