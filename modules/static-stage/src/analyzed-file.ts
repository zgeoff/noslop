import type { ChangedLines } from './build-changed-lines';
import type { ParsedSource } from './parse-source';
import type { SourceAnalysis } from './source-analysis';
import type { ChangedFile } from './types';

// one changed file with its head text and, for code, its syntax tree and the facts of its walk; a
// context file is an unchanged file read only for what a check needs beside the change, such as the
// tests of a changed source, and no slice holds it
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

  // the line of the version field, or the first line when the manifest has none
  versionLine: number;
  isPrivate: boolean;
  dependencies: Record<string, string>;
}
