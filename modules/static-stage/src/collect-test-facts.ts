import type { AnalyzeContext } from './analyze-context';
import type { ASTNode } from './ast-node';
import { collectFromAST } from './collect-from-ast';
import { getCalleeName } from './get-callee-name';
import { getFields } from './get-fields';
import { isCallMatch } from './is-call-match';
import { isFunctionNode } from './is-function-node';

const TEST_CALLS = new Set([
  'test',
  'it',
  'test.only',
  'it.only',
  'test.concurrent',
  'it.concurrent',
]);

const TABLE_CALLS = new Set(['test.each()', 'it.each()']);
const ASSERTION_ROOTS = new Set(['expect', 'assert', 't', 'should']);

// records each test with its title, whether its body asserts anything, and a fingerprint of its body
// with the whitespace and comments gone, so 2 tests with one body match
export function collectTestFacts(node: ASTNode, name: string, ctx: AnalyzeContext): void {
  const isTable = TABLE_CALLS.has(name);

  if (!TEST_CALLS.has(name) && !isTable) {
    return;
  }

  const args = getFields(node, 'arguments');
  const [title] = args;
  const body = args.find((arg) => isFunctionNode(arg));

  if (title === undefined || body === undefined) {
    return;
  }

  ctx.analysis.tests.push({
    title: readTitle(title, ctx),
    startLine: ctx.parsed.getLine(node.start),
    endLine: ctx.parsed.getLine(node.end),
    hasAssertion: hasAssertion(body, ctx),
    isTable,
    fingerprint: ctx.parsed.text
      .slice(body.start, body.end)
      .replaceAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\//gu, '')
      .replaceAll(/\s+/gu, ''),
  });
}

function readTitle(node: ASTNode, ctx: AnalyzeContext): string {
  if (typeof node['value'] === 'string') {
    return node['value'];
  }

  return ctx.parsed.text.slice(node.start, node.end);
}

function hasAssertion(body: ASTNode, ctx: AnalyzeContext): boolean {
  let found = false;

  collectFromAST(body, (node) => {
    if (found || node.type !== 'CallExpression') {
      return;
    }

    const name = getCalleeName(node) ?? '';
    const root = name.split('.')[0] ?? '';

    found =
      ASSERTION_ROOTS.has(root) ||
      /^(?:assert|expect|verify)/u.test(root) ||
      isCallMatch(name, ctx.stack.invariant.calls) ||
      hasAssertionRoot(node);
  });

  return found;
}

// a chain such as `expect(x).toBe(1)` has a callee with no static name, so the walk reads its root
function hasAssertionRoot(node: ASTNode): boolean {
  let current: unknown = node;

  while (typeof current === 'object' && current !== null) {
    const callee: unknown = Reflect.get(current, 'callee') ?? Reflect.get(current, 'object');

    if (typeof callee !== 'object' || callee === null) {
      return false;
    }

    if (Reflect.get(callee, 'type') === 'Identifier') {
      return ASSERTION_ROOTS.has(String(Reflect.get(callee, 'name')));
    }

    current = callee;
  }

  return false;
}
