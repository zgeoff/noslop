import type { AnalyzeContext } from './analyze-context';
import type { ASTNode } from './ast-node';
import { findEnclosingFunction } from './find-enclosing-function';
import { getField } from './get-field';
import { getFields } from './get-fields';
import { isFunctionNode } from './is-function-node';
import type { ValueOrigin } from './types';

const BRANCH_TYPES = new Set([
  'IfStatement',
  'ConditionalExpression',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'CatchClause',
]);

const LOGICAL_OPERATORS = new Set(['&&', '||', '??']);

// records each function with its name, parameters and cyclomatic complexity: 1, plus 1 for each
// branch, loop, catch, switch case and logical operator in its own body, not in a nested function
export function collectFunctionFacts(
  node: ASTNode,
  ancestors: readonly ASTNode[],
  ctx: AnalyzeContext,
): void {
  if (isFunctionNode(node)) {
    const parent = ancestors.at(-1) ?? null;
    const params = getFields(node, 'params').map((param) => getParamName(param, ctx));

    const declarations = new Map<string, { origin: ValueOrigin; from: string | null }>(
      params.map((param) => [param, { origin: 'parameter', from: null }]),
    );

    ctx.functionIndex.set(node, ctx.analysis.functions.length);

    ctx.analysis.functions.push({
      name: getFunctionName(node, parent),
      params,
      startLine: ctx.parsed.getLine(node.start),
      endLine: ctx.parsed.getLine(node.end),
      exported: ancestors.some(
        (ancestor) =>
          ancestor.type === 'ExportNamedDeclaration' ||
          ancestor.type === 'ExportDefaultDeclaration',
      ),
      complexity: 1,
      calls: [],
      literals: [],
      declarations,
    });

    return;
  }

  const owner = findEnclosingFunction(ancestors, ctx);
  const facts = owner === null ? null : ctx.analysis.functions[owner];

  if (facts === undefined || facts === null) {
    return;
  }

  if (isBranch(node)) {
    facts.complexity += 1;
  }

  if (node.type === 'Literal' && typeof node['value'] === 'string' && facts.literals.length < 50) {
    facts.literals.push(node['value']);
  }

  if (node.type === 'VariableDeclarator') {
    const id = getField(node, 'id');
    const name = id?.['name'];

    if (typeof name === 'string') {
      facts.declarations.set(name, readOrigin(getField(node, 'init')));
    }
  }
}

function isBranch(node: ASTNode): boolean {
  if (BRANCH_TYPES.has(node.type)) {
    return true;
  }

  if (node.type === 'SwitchCase') {
    return getField(node, 'test') !== null;
  }

  return node.type === 'LogicalExpression' && LOGICAL_OPERATORS.has(String(node['operator']));
}

function readOrigin(init: ASTNode | null): { origin: ValueOrigin; from: string | null } {
  if (init === null) {
    return { origin: 'internal', from: null };
  }

  if (init.type === 'AwaitExpression') {
    return { origin: 'await', from: null };
  }

  if (init.type === 'CallExpression' || init.type === 'NewExpression') {
    return { origin: 'call', from: null };
  }

  if (
    init.type === 'Literal' ||
    (init.type === 'TemplateLiteral' && getFields(init, 'expressions').length === 0)
  ) {
    return { origin: 'constant', from: null };
  }

  if (init.type === 'MemberExpression') {
    return { origin: 'member', from: null };
  }

  if (init.type === 'Identifier' && typeof init['name'] === 'string') {
    return { origin: 'internal', from: init['name'] };
  }

  return { origin: 'internal', from: null };
}

function getFunctionName(node: ASTNode, parent: ASTNode | null): string {
  const id = getField(node, 'id');

  if (typeof id?.['name'] === 'string') {
    return id['name'];
  }

  if (parent === null) {
    return '<anonymous>';
  }

  const key =
    parent.type === 'VariableDeclarator' ? getField(parent, 'id') : getField(parent, 'key');

  if (typeof key?.['name'] === 'string') {
    return key['name'];
  }

  if (typeof key?.['value'] === 'string') {
    return key['value'];
  }

  return '<anonymous>';
}

function getParamName(param: ASTNode, ctx: AnalyzeContext): string {
  const target = param.type === 'TSParameterProperty' ? getField(param, 'parameter') : param;
  const inner = target?.type === 'AssignmentPattern' ? getField(target, 'left') : target;

  if (typeof inner?.['name'] === 'string') {
    return inner['name'];
  }

  return ctx.parsed.text.slice(param.start, param.end).replaceAll(/\s+/gu, ' ');
}
