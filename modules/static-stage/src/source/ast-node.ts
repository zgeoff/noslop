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
