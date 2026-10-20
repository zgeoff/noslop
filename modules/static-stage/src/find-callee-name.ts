import type { ASTNode } from './ast-node';
import { findField } from './find-field';

// the dotted name a call or `new` targets, such as `db.insertInto` or `Bun.write`; null for a callee
// with no static name, such as a computed member or a call on a call's result
export function findCalleeName(node: ASTNode): string | null {
  const callee = findField(node, 'callee');

  return callee === null ? null : findDottedName(callee);
}

function findDottedName(node: ASTNode): string | null {
  if (node.type === 'Identifier') {
    return typeof node['name'] === 'string' ? node['name'] : null;
  }

  if (node.type === 'ThisExpression') {
    return 'this';
  }

  if (node.type === 'Super') {
    return 'super';
  }

  if (node.type === 'MemberExpression' && node['computed'] !== true) {
    const object = findField(node, 'object');
    const property = findField(node, 'property');
    const objectName = object === null ? null : findDottedName(object);
    const propertyName = property?.['name'];

    if (typeof propertyName !== 'string') {
      return null;
    }

    return objectName === null ? `?.${propertyName}` : `${objectName}.${propertyName}`;
  }

  if (node.type === 'ChainExpression' || node.type === 'TSNonNullExpression') {
    const expression = findField(node, 'expression');

    return expression === null ? null : findDottedName(expression);
  }

  return null;
}
