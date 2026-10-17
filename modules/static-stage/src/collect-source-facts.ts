import type { ReviewConfig } from '@noslop/contract';
import type { AnalyzeContext } from './analyze-context';
import { collectCallFacts } from './collect-call-facts';
import { collectDeclarationFacts } from './collect-declaration-facts';
import { collectFromAST } from './collect-from-ast';
import { collectFunctionFacts } from './collect-function-facts';
import { collectStatementFacts } from './collect-statement-facts';
import { getField } from './get-field';
import { getFields } from './get-fields';
import type { ParsedSource } from './parse-source';
import type { SourceAnalysis } from './source-analysis';
import { buildSourceAnalysis } from './source-analysis';

// walks the syntax tree once, and each collector reads every node; the imports are read first, so a
// call on an imported name knows its source wherever the import sits
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

  for (const statement of getFields(parsed.program, 'body')) {
    if (statement.type !== 'ImportDeclaration') {
      continue;
    }

    const source = getField(statement, 'source')?.['value'];

    for (const specifier of getFields(statement, 'specifiers')) {
      const local = getField(specifier, 'local')?.['name'];

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
