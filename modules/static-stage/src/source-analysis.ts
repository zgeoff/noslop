import type { StackPatternKind } from '@noslop/contract';
import type { SecurityPart, ValueOrigin } from './types';

interface FunctionFacts {
  name: string;
  params: string[];
  startLine: number;
  endLine: number;
  exported: boolean;
  complexity: number;
  calls: string[];
  literals: string[];

  declarations: Map<string, { origin: ValueOrigin; from: string | null }>;
}

interface CallFacts {
  name: string;
  line: number;
  functionIndex: number | null;
  inTransaction: boolean;
  matches: StackPatternKind[];
}

interface TestFacts {
  title: string;
  startLine: number;
  endLine: number;
  hasAssertion: boolean;
  isTable: boolean;
  fingerprint: string;
}

interface GuardFacts {
  line: number;
  kind: 'throw' | 'early-return' | 'invariant';
  condition: string;
  names: string[];
  functionIndex: number | null;
}

interface ThrowFacts {
  line: number;
  kind: 'throw' | 'catch' | 'detached';
  endLine: number;
  type: string | null;
  catchLine: number | null;
}

interface TypeDeclaration {
  name: string;
  keys: string[];
  startLine: number;
  endLine: number;
  exported: boolean;

  isComplete: boolean;
}

export interface SourceAnalysis {
  path: string;
  functions: FunctionFacts[];
  calls: CallFacts[];
  tests: TestFacts[];
  guards: GuardFacts[];
  throws: ThrowFacts[];

  security: { line: number; endLine: number; part: SecurityPart; detail: string; body?: string }[];
  imports: { source: string; names: string[]; line: number }[];
  exports: { name: string; line: number; endLine: number }[];
  types: TypeDeclaration[];
  typeTests: { typeName: string; key: string; line: number }[];

  anyTypes: number[];
  jsonParses: number[];
  schemaBounds: { property: string; max: number; line: number }[];
  configReads: { name: string; line: number }[];
}

export function buildSourceAnalysis(path: string): SourceAnalysis {
  return {
    path,
    functions: [],
    calls: [],
    tests: [],
    guards: [],
    throws: [],
    security: [],
    imports: [],
    exports: [],
    types: [],
    typeTests: [],
    anyTypes: [],
    jsonParses: [],
    schemaBounds: [],
    configReads: [],
  };
}
