import type { ChangedLines } from './change/build-changed-lines';
import type { ParsedSource } from './source/parse-source';
import type { SourceAnalysis } from './source/source-analysis';
import type { ChangedFile } from './types';

export interface AnalyzedFile {
  file: ChangedFile;
  isContext: boolean;
  text: string | null;
  parsed: ParsedSource | null;
  analysis: SourceAnalysis | null;
  lines: ChangedLines;
}

export interface PackageManifest {
  directory: string;
  path: string;
  name: string | null;
  version: string | null;

  versionLine: number;
  isPrivate: boolean;
  dependencies: Record<string, string>;
  scriptCommands: string[];
}
