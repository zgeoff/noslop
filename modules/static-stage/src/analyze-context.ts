import type { ReviewConfig } from '@noslop/contract';
import type { ASTNode } from './ast-node';
import type { ParsedSource } from './parse-source';
import type { SourceAnalysis } from './source-analysis';

// the state one walk of a file shares between its collectors
export interface AnalyzeContext {
  parsed: ParsedSource;
  stack: ReviewConfig['stack'];
  analysis: SourceAnalysis;
  functionIndex: Map<ASTNode, number>;
  importSources: Map<string, string>;
}
