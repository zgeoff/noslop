import { match } from 'ts-pattern';
import type { AnalyzeContext } from './analyze-context';
import type { ASTNode } from './ast-node';
import { getCalleeName } from './get-callee-name';
import { getField } from './get-field';
import { getFields } from './get-fields';
import { getNodeText } from './get-node-text';
import { isFunctionNode } from './is-function-node';

const ALLOW_DENY_NAME =
  /^(?:can[A-Z]|is(?:Allowed|Authori[sz]ed|Admin|Owner|Permitted)|has(?:Permission|Access|Role|Scope)|authori[sz]e|check(?:Access|Permission|Auth)|require(?:Auth|Role|Permission|Owner|Admin)|verify(?:Token|Session|Signature|Access)|guard)/u;

const ROW_MAPPER_NAME = /^(?:to[A-Z]\w*(?:Data|DTO|Dto|Response|Row|JSON|Json)|map\w*Row)$/u;

const CREDENTIAL_PATH =
  /(?:^|\/)\.env(?:\.|$)|credentials?(?:\.json)?$|\.npmrc$|\.netrc$|id_(?:rsa|ed25519)|\.aws\/|(?:^|\/)secrets?\//u;

const CREDENTIAL_NAME = /TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL/u;

const ENV_OBJECTS = new Set(['process.env', 'Bun.env', 'import.meta.env']);

const INSTRUCTION_KEYS = new Set([
  'system',
  'systemPrompt',
  'instructions',
  'developer_instructions',
  'developerInstructions',
]);

// records the imports, the exports, the declared types with their keys, the `any` types and the calls
// that return `any`, the config reads, and the security facts a declaration shows: an allow-or-deny
// function, a row mapper, a credential path and text placed into a model's instructions
export function collectDeclarationFacts(
  node: ASTNode,
  ancestors: readonly ASTNode[],
  ctx: AnalyzeContext,
): void {
  const line = ctx.parsed.getLine(node.start);
  const exported = ancestors.at(-1)?.type === 'ExportNamedDeclaration';

  match(node.type)
    .with('ImportDeclaration', () => {
      collectImport(node, line, ctx);
    })
    .with('ExportNamedDeclaration', () => {
      collectExports(node, line, ctx);
    })
    .with('TSInterfaceDeclaration', 'TSTypeAliasDeclaration', () => {
      collectType(node, exported, ctx);
    })
    .with('TSAnyKeyword', () => {
      ctx.analysis.anyTypes.push(line);
    })
    .with('CallExpression', () => {
      collectAnyCall(node, line, ctx);
    })
    .with('MemberExpression', () => {
      collectConfigRead(node, line, ctx);
    })
    .with('Literal', () => {
      collectCredentialPath(node, line, ctx);
    })
    .with('Property', () => {
      collectInstructionText(node, line, ctx);
    })
    .otherwise(() => {
      if (isFunctionNode(node)) {
        collectSecurityFunction(node, ancestors, ctx);
      }
    });
}

// `JSON.parse` is the one call whose result is typed `any` by its name alone; any other call, such as
// a `.json()` reader, needs its receiver's type, which the syntax tree does not hold
function collectAnyCall(node: ASTNode, line: number, ctx: AnalyzeContext): void {
  if (getCalleeName(node) === 'JSON.parse') {
    ctx.analysis.jsonParses.push(line);
  }
}

function collectCredentialPath(node: ASTNode, line: number, ctx: AnalyzeContext): void {
  const value = node['value'];

  if (typeof value === 'string' && CREDENTIAL_PATH.test(value)) {
    ctx.analysis.security.push({
      line,
      endLine: line,
      part: 'credential-read',
      detail: `names the credential path ${value}`,
    });
  }
}

function collectImport(node: ASTNode, line: number, ctx: AnalyzeContext): void {
  const source = getField(node, 'source')?.['value'];

  if (typeof source !== 'string') {
    return;
  }

  const names = getFields(node, 'specifiers').flatMap((specifier) => {
    const local = getField(specifier, 'local')?.['name'];

    return typeof local === 'string' ? [local] : [];
  });

  for (const name of names) {
    ctx.importSources.set(name, source);
  }

  ctx.analysis.imports.push({ source, names, line });
}

function collectExports(node: ASTNode, line: number, ctx: AnalyzeContext): void {
  const declaration = getField(node, 'declaration');
  const names: string[] = [];

  if (declaration !== null) {
    const id = getField(declaration, 'id')?.['name'];

    if (typeof id === 'string') {
      names.push(id);
    }

    for (const declarator of getFields(declaration, 'declarations')) {
      const name = getField(declarator, 'id')?.['name'];

      if (typeof name === 'string') {
        names.push(name);
      }
    }
  }

  for (const specifier of getFields(node, 'specifiers')) {
    const name = getField(specifier, 'exported')?.['name'];

    if (typeof name === 'string') {
      names.push(name);
    }
  }

  const endLine = ctx.parsed.getLine(node.end);

  for (const name of names) {
    ctx.analysis.exports.push({ name, line, endLine });
  }
}

function collectType(node: ASTNode, exported: boolean, ctx: AnalyzeContext): void {
  const name = getField(node, 'id')?.['name'];
  const body = getField(node, 'body') ?? getField(node, 'typeAnnotation');
  const memberField = body?.type === 'TSInterfaceBody' ? 'body' : 'members';
  const members = body === null ? [] : getFields(body, memberField);

  if (typeof name !== 'string') {
    return;
  }

  ctx.analysis.types.push({
    name,
    keys: members.flatMap((member) => {
      const key = getField(member, 'key');
      const keyName = key?.['name'] ?? key?.['value'];

      return typeof keyName === 'string' ? [keyName] : [];
    }),
    startLine: ctx.parsed.getLine(node.start),
    endLine: ctx.parsed.getLine(node.end),
    exported,
    isComplete:
      getFields(node, 'extends').length === 0 &&
      (body?.type === 'TSInterfaceBody' || body?.type === 'TSTypeLiteral'),
  });
}

function collectConfigRead(node: ASTNode, line: number, ctx: AnalyzeContext): void {
  const object = getField(node, 'object');
  const property = getField(node, 'property');

  if (object === null || property === null) {
    return;
  }

  const objectText = getNodeText(object, ctx, 40);
  const name = node['computed'] === true ? property['value'] : property['name'];

  if (!ENV_OBJECTS.has(objectText) || typeof name !== 'string') {
    return;
  }

  ctx.analysis.configReads.push({ name, line });

  if (CREDENTIAL_NAME.test(name)) {
    ctx.analysis.security.push({
      line,
      endLine: line,
      part: 'credential-read',
      detail: `reads ${objectText}.${name}`,
    });
  }
}

function collectInstructionText(node: ASTNode, line: number, ctx: AnalyzeContext): void {
  const key = getField(node, 'key');
  const value = getField(node, 'value');
  const keyName = key?.['name'] ?? key?.['value'];

  if (typeof keyName !== 'string' || !INSTRUCTION_KEYS.has(keyName) || value === null) {
    return;
  }

  const isBuilt =
    (value.type === 'TemplateLiteral' && getFields(value, 'expressions').length > 0) ||
    value.type === 'BinaryExpression';

  if (isBuilt) {
    ctx.analysis.security.push({
      line,
      endLine: line,
      part: 'injection-sink',
      detail: `text built from input placed into the model's ${keyName}`,
    });
  }
}

function collectSecurityFunction(
  node: ASTNode,
  ancestors: readonly ASTNode[],
  ctx: AnalyzeContext,
): void {
  const parent = ancestors.at(-1);

  const id =
    getField(node, 'id') ?? (parent?.type === 'VariableDeclarator' ? getField(parent, 'id') : null);

  const name = id?.['name'];

  if (typeof name !== 'string') {
    return;
  }

  const line = ctx.parsed.getLine(node.start);
  const endLine = ctx.parsed.getLine(node.end);

  if (ALLOW_DENY_NAME.test(name)) {
    ctx.analysis.security.push({
      line,
      endLine,
      part: 'allow-deny-check',
      detail: `${name} decides access`,
    });
  }

  if (ROW_MAPPER_NAME.test(name)) {
    ctx.analysis.security.push({
      line,
      endLine,
      part: 'row-mapper',
      detail: `${name} maps a row to output`,
    });
  }
}
