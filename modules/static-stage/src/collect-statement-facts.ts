import type { AnalyzeContext } from './analyze-context';
import type { ASTNode } from './ast-node';
import { collectFromAST } from './collect-from-ast';
import { findCalleeName } from './find-callee-name';
import { findEnclosingFunction } from './find-enclosing-function';
import { findField } from './find-field';
import { getFields } from './get-fields';
import { getNodeText } from './get-node-text';
import { isCallMatch } from './is-call-match';
import { isFunctionNode } from './is-function-node';

// records each throw with its nearest catch, each catch, each call left to run detached, and each
// guard: a throw or an early return under an if, or an invariant call
export function collectStatementFacts(
  node: ASTNode,
  ancestors: readonly ASTNode[],
  ctx: AnalyzeContext,
): void {
  const line = ctx.parsed.getLine(node.start);

  if (node.type === 'ThrowStatement') {
    const argument = findField(node, 'argument');

    ctx.analysis.throws.push({
      line,
      kind: 'throw',
      type: argument?.type === 'NewExpression' ? findCalleeName(argument) : null,
      catchLine: findNearestCatch(node, ancestors, ctx),
    });
  } else if (node.type === 'CatchClause') {
    ctx.analysis.throws.push({ line, kind: 'catch', type: null, catchLine: line });
  } else if (node.type === 'ExpressionStatement') {
    collectDetached(findField(node, 'expression'), line, ctx);
  } else if (node.type === 'IfStatement') {
    collectGuard(node, ancestors, ctx);
  } else if (node.type === 'CallExpression') {
    const name = findCalleeName(node) ?? '';
    const [condition] = getFields(node, 'arguments');

    if (isCallMatch(name, ctx.stack.invariant.calls) && condition !== undefined) {
      ctx.analysis.guards.push({
        line,
        kind: 'invariant',
        condition: getNodeText(condition, ctx, 120),
        names: collectNames(condition),
        functionIndex: findEnclosingFunction(ancestors, ctx),
      });
    }
  }
}

function findNearestCatch(
  node: ASTNode,
  ancestors: readonly ASTNode[],
  ctx: AnalyzeContext,
): number | null {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];

    if (ancestor === undefined || isFunctionNode(ancestor)) {
      return null;
    }

    const block = findField(ancestor, 'block');
    const handler = findField(ancestor, 'handler');

    if (
      ancestor.type === 'TryStatement' &&
      handler !== null &&
      block !== null &&
      node.start >= block.start &&
      node.end <= block.end
    ) {
      return ctx.parsed.getLine(handler.start);
    }
  }

  return null;
}

// `void run()`, and a `.then` chain left as a statement, run with nobody awaiting them; the catch the
// chain ends in, if any, is the one that sees their failure
function collectDetached(expression: ASTNode | null, line: number, ctx: AnalyzeContext): void {
  if (expression === null) {
    return;
  }

  const target =
    expression.type === 'UnaryExpression' && expression['operator'] === 'void'
      ? findField(expression, 'argument')
      : expression;

  if (target?.type !== 'CallExpression') {
    return;
  }

  const name = findCalleeName(target) ?? '';
  const isVoid = target !== expression;
  const isChain = /\.(?:then|catch|finally)$/u.test(name);

  if (!isVoid && !isChain) {
    return;
  }

  ctx.analysis.throws.push({
    line,
    kind: 'detached',
    type: null,
    catchLine: name.endsWith('.catch') ? line : null,
  });
}

const DENY_TEXT =
  /\b(?:401|403|forbidden|unauthori[sz]ed|access denied|not allowed|permission)\b/iu;

function collectGuard(node: ASTNode, ancestors: readonly ASTNode[], ctx: AnalyzeContext): void {
  const test = findField(node, 'test');
  const consequent = findField(node, 'consequent');

  const first =
    consequent?.type === 'BlockStatement' ? getFields(consequent, 'body')[0] : consequent;

  if (test === null || first === undefined || first === null) {
    return;
  }

  const kind = pickGuardKind(first);

  if (kind === null) {
    return;
  }

  const line = ctx.parsed.getLine(node.start);
  const consequentText = getNodeText(first, ctx, 200);

  ctx.analysis.guards.push({
    line,
    kind,
    condition: getNodeText(test, ctx, 120),
    names: collectNames(test),
    functionIndex: findEnclosingFunction(ancestors, ctx),
  });

  if (DENY_TEXT.test(consequentText)) {
    ctx.analysis.security.push({
      line,
      endLine: ctx.parsed.getLine(node.end),
      part: 'allow-deny-check',
      detail: `denies when ${getNodeText(test, ctx, 80)}`,
    });
  }
}

function pickGuardKind(statement: ASTNode): 'throw' | 'early-return' | null {
  if (statement.type === 'ThrowStatement') {
    return 'throw';
  }

  return statement.type === 'ReturnStatement' ? 'early-return' : null;
}

// the names a condition reads, without the property names of its member reads
function collectNames(condition: ASTNode): string[] {
  const names = new Set<string>();

  collectFromAST(condition, (node, ancestors) => {
    const parent = ancestors.at(-1);

    const isProperty =
      parent?.type === 'MemberExpression' &&
      parent['computed'] !== true &&
      findField(parent, 'property') === node;

    if (node.type === 'Identifier' && !isProperty && typeof node['name'] === 'string') {
      names.add(node['name']);
    }
  });

  return [...names];
}
