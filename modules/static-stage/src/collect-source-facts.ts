import type { ReviewConfig } from '@noslop/contract';
import type { AnalyzeContext } from './analyze-context';
import { collectCallFacts } from './collect-call-facts';
import { collectDeclarationFacts } from './collect-declaration-facts';
import { collectFromAST } from './collect-from-ast';
import { collectFunctionFacts } from './collect-function-facts';
import { collectStatementFacts } from './collect-statement-facts';
import { findField } from './find-field';
import { getFields } from './get-fields';
import type { ParsedSource } from './parse-source';
import type { SourceAnalysis } from './source-analysis';
import { buildSourceAnalysis } from './source-analysis';

export function collectSourceFacts(
  parsed: ParsedSource,
  stack: ReviewConfig['stack'],
): SourceAnalysis {
  const ctx: AnalyzeContext = {
    parsed,
    stack,
    analysis: buildSourceAnalysis(parsed.path),
    functionIndex: new Map(),
    importSources: new Map(),
  };

  // an import binds its name for the whole module wherever it sits, so the imports are read before
  // the walk
  for (const statement of getFields(parsed.program, 'body')) {
    if (statement.type !== 'ImportDeclaration') {
      continue;
    }

    const source = findField(statement, 'source')?.['value'];

    for (const specifier of getFields(statement, 'specifiers')) {
      const local = findField(specifier, 'local')?.['name'];

      if (typeof source === 'string' && typeof local === 'string') {
        ctx.importSources.set(local, source);
      }
    }
  }

  collectFromAST(parsed.program, (node, ancestors) => {
    collectFunctionFacts(node, ancestors, ctx);
    collectCallFacts(node, ancestors, ctx);
    collectStatementFacts(node, ancestors, ctx);
    collectDeclarationFacts(node, ancestors, ctx);
  });

  return ctx.analysis;
}
