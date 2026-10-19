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

  // each local name the function declares, with where its value comes from
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
  type: string | null;
  catchLine: number | null;
}

interface TypeDeclaration {
  name: string;
  keys: string[];
  startLine: number;
  endLine: number;
  exported: boolean;

  // false when the type takes keys from elsewhere, through extends, an intersection or a mapped type
  isComplete: boolean;
}

// everything the one walk of a file collects; the slices cut it down to the changed lines
export interface SourceAnalysis {
  path: string;
  functions: FunctionFacts[];
  calls: CallFacts[];
  tests: TestFacts[];
  guards: GuardFacts[];
  throws: ThrowFacts[];

  // a security fact spans its whole declaration, so a change inside an access check keeps it
  security: { line: number; endLine: number; part: SecurityPart; detail: string }[];
  imports: { source: string; names: string[]; line: number }[];
  exports: { name: string; line: number; endLine: number }[];
  types: TypeDeclaration[];
  typeTests: { typeName: string; key: string; line: number }[];

  // the line of each `any` type the file writes
  anyTypes: number[];
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
    schemaBounds: [],
    configReads: [],
  };
}
