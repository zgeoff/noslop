import type { ReviewConfig } from '@noslop/contract';
import type { ASTNode } from './ast-node';
import type { ParsedSource } from './parse-source';
import type { SourceAnalysis } from './source-analysis';

export interface AnalyzeContext {
  parsed: ParsedSource;
  stack: ReviewConfig['stack'];
  analysis: SourceAnalysis;
  functionIndex: Map<ASTNode, number>;
  importSources: Map<string, string>;
}
