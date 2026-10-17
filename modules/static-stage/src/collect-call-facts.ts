import type { StackPatternKind } from '@noslop/contract';
import type { AnalyzeContext } from './analyze-context';
import type { ASTNode } from './ast-node';
import { collectTestFacts } from './collect-test-facts';
import { findEnclosingFunction } from './find-enclosing-function';
import { getCalleeName } from './get-callee-name';
import { getField } from './get-field';
import { getFields } from './get-fields';
import { getNodeText } from './get-node-text';
import { isCallMatch } from './is-call-match';

const STACK_KINDS: readonly StackPatternKind[] = [
  'writes',
  'io',
  'procedures',
  'transactionHelper',
  'logger',
  'invariant',
  'events',
];

const SHELL_SINKS = ['exec', 'execSync', 'execFile', 'execFileSync'];
const SPAWN_SINKS = ['spawn', 'spawnSync'];
const SQL_SINKS = ['raw', 'unsafe', 'query', '$queryRawUnsafe', '$executeRawUnsafe', 'sql.raw'];
const CODE_SINKS = ['eval', 'Function'];
const REDIRECT_SINKS = ['redirect'];

const REQUEST_PATH_CALLS = [
  'use',
  'onRequest',
  'beforeHandle',
  'onBeforeHandle',
  'guard',
  'derive',
];

const SENSITIVE_HEADER = /override|forwarded|x-http-method|authorization|x-user|x-role|cookie/iu;

// records each call with the stack patterns it matches, and the facts that only a call shows: a test,
// a type test, a schema bound, an injection sink and the request path
export function collectCallFacts(
  node: ASTNode,
  ancestors: readonly ASTNode[],
  ctx: AnalyzeContext,
): void {
  if (node.type !== 'CallExpression' && node.type !== 'NewExpression') {
    return;
  }

  const name = getCallName(node);

  if (name === null) {
    return;
  }

  const line = ctx.parsed.getLine(node.start);
  const functionIndex = findEnclosingFunction(ancestors, ctx);
  const owner = functionIndex === null ? null : ctx.analysis.functions[functionIndex];
  const matches = STACK_KINDS.filter((kind) => isStackMatch(name, kind, ctx));

  owner?.calls.push(name);

  ctx.analysis.calls.push({
    name,
    line,
    functionIndex,
    inTransaction: ancestors.some(
      (ancestor) =>
        ancestor.type === 'CallExpression' &&
        isStackMatch(getCalleeName(ancestor) ?? '', 'transactionHelper', ctx),
    ),
    matches,
  });

  collectTestFacts(node, name, ctx);
  collectTypeTest(node, name, ctx);
  collectSchemaBound(node, name, ancestors, ctx);
  collectSink(node, name, ctx);
}

function getCallName(node: ASTNode): string | null {
  const name = getCalleeName(node);

  if (name !== null) {
    return name;
  }

  const callee = getField(node, 'callee');
  const inner = callee?.type === 'CallExpression' ? getCalleeName(callee) : null;

  return inner === null ? null : `${inner}()`;
}

function isStackMatch(name: string, kind: StackPatternKind, ctx: AnalyzeContext): boolean {
  const pattern = ctx.stack[kind];

  if (isCallMatch(name, pattern.calls)) {
    return true;
  }

  const root = name.split('.')[0] ?? name;
  const source = ctx.importSources.get(root);

  return source !== undefined && pattern.imports.includes(source);
}

function collectTypeTest(node: ASTNode, name: string, ctx: AnalyzeContext): void {
  if (!name.endsWith('.toHaveProperty')) {
    return;
  }

  const key = getFields(node, 'arguments')[0]?.['value'];
  const typeName = findExpectedType(getField(node, 'callee'));

  if (typeof key === 'string' && typeName !== null) {
    ctx.analysis.typeTests.push({ typeName, key, line: ctx.parsed.getLine(node.start) });
  }
}

function findExpectedType(start: ASTNode | null): string | null {
  let current = start;

  while (current !== null) {
    if (current.type === 'CallExpression' && getCalleeName(current) === 'expectTypeOf') {
      const typeArguments = getField(current, 'typeArguments');
      const reference = typeArguments === null ? null : getFields(typeArguments, 'params')[0];

      const typeName =
        reference === undefined || reference === null ? null : getField(reference, 'typeName');

      return typeof typeName?.['name'] === 'string' ? typeName['name'] : null;
    }

    const field = current.type === 'CallExpression' ? 'callee' : 'object';

    current = getField(current, field);
  }

  return null;
}

function collectSchemaBound(
  node: ASTNode,
  name: string,
  ancestors: readonly ASTNode[],
  ctx: AnalyzeContext,
): void {
  const max = getFields(node, 'arguments')[0]?.['value'];

  if (!name.endsWith('.max') || typeof max !== 'number') {
    return;
  }

  const property = ancestors.findLast((ancestor) => ancestor.type === 'Property');
  const key = property === undefined ? null : getField(property, 'key');
  const keyName = key?.['name'] ?? key?.['value'];

  if (typeof keyName === 'string') {
    ctx.analysis.schemaBounds.push({
      property: keyName,
      max,
      line: ctx.parsed.getLine(node.start),
    });
  }
}

function collectSink(node: ASTNode, name: string, ctx: AnalyzeContext): void {
  const args = getFields(node, 'arguments');
  const first = args[0] ?? null;
  const line = ctx.parsed.getLine(node.start);

  const collectEntry = (part: 'injection-sink' | 'request-path', detail: string): void => {
    ctx.analysis.security.push({ line, part, detail });
  };

  if (isCallMatch(name, SHELL_SINKS) && isBuiltFromInput(first)) {
    collectEntry('injection-sink', `shell command built from input in ${name}`);
  } else if (
    isCallMatch(name, SPAWN_SINKS) &&
    args.some((arg) => getNodeText(arg, ctx, 400).includes('shell: true'))
  ) {
    collectEntry('injection-sink', `${name} with shell: true`);
  } else if (
    isCallMatch(name, SQL_SINKS) &&
    isBuiltFromInput(first) &&
    first?.type !== 'Identifier'
  ) {
    collectEntry('injection-sink', `SQL text built from input in ${name}`);
  } else if (isCallMatch(name, CODE_SINKS)) {
    collectEntry('injection-sink', `code built at run time in ${name}`);
  } else if (isCallMatch(name, REDIRECT_SINKS) && isBuiltFromInput(first)) {
    collectEntry('injection-sink', `redirect to a URL built from input in ${name}`);
  }

  if (isCallMatch(name, REQUEST_PATH_CALLS) || isCallMatch(name, ctx.stack.procedures.calls)) {
    collectEntry('request-path', `${name} on the request path`);
  }

  const header = first?.['value'];

  if (name.endsWith('headers.get') && typeof header === 'string' && SENSITIVE_HEADER.test(header)) {
    collectEntry('request-path', `reads the ${header} header`);
  }
}

// a value that is not a literal written in the code: a template with expressions, a concatenation, or
// a name, member or call whose value the code receives
function isBuiltFromInput(node: ASTNode | null): boolean {
  if (node === null) {
    return false;
  }

  if (node.type === 'Literal') {
    return false;
  }

  if (node.type === 'TemplateLiteral') {
    return getFields(node, 'expressions').length > 0;
  }

  if (node.type === 'BinaryExpression') {
    return isBuiltFromInput(getField(node, 'left')) || isBuiltFromInput(getField(node, 'right'));
  }

  return ['Identifier', 'MemberExpression', 'CallExpression', 'AwaitExpression'].includes(
    node.type,
  );
}
