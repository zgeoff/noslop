export interface DiffLine {
  kind: 'added' | 'deleted' | 'context';
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export type FileKind = 'code' | 'test' | 'prose' | 'instructions' | 'infra' | 'config' | 'other';

export interface ChangedFile {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  binary: boolean;
  kind: FileKind;
  hunks: Hunk[];
  addedLines: number;
  deletedLines: number;
}

// the change between 2 commits, with generated files and lockfiles left out
export interface Change {
  base: string;
  head: string;
  files: ChangedFile[];
  excluded: string[];

  // the files of an incremental review's new commits that only a merge from the base branch changes,
  // which the change leaves out
  baseOnly?: ChangedFile[];

  // the paths the whole pull request adds or edits since its merge base, a rename under its new path,
  // which an incremental review's change can leave out
  pullRequestPaths?: string[];
}

// a place in a file at the reviewed head
export interface SourceLocation {
  path: string;
  startLine: number;
  endLine: number;
}

export interface FunctionEntry {
  location: SourceLocation;
  name: string;
  params: string[];
  exported: boolean;
  isNew: boolean;
  complexity: number;
  ioCalls: string[];
  writes: string[];
}

export interface ReuseEntry {
  function: FunctionEntry;
  candidates: { name: string; location: SourceLocation; score: number }[];
}

// where a guard's condition value comes from, traced 1 or 2 steps back
export type ValueOrigin =
  | 'parameter'
  | 'call'
  | 'await'
  | 'constant'
  | 'member'
  | 'internal'
  | 'unknown';

export interface GuardEntry {
  location: SourceLocation;
  kind: 'throw' | 'early-return' | 'invariant';
  condition: string;
  origins: { name: string; origin: ValueOrigin }[];
}

export interface ThrowEntry {
  location: SourceLocation;
  kind: 'throw' | 'catch' | 'detached';
  type: string | null;
  nearestCatch: SourceLocation | null;
}

export interface WriteEntry {
  location: SourceLocation;
  call: string;
  inTransaction: boolean;
  eventsBeside: string[];
}

export type SecurityPart =
  | 'allow-deny-check'
  | 'injection-sink'
  | 'request-path'
  | 'row-mapper'
  | 'credential-read';

export interface SecurityEntry {
  location: SourceLocation;
  part: SecurityPart;
  detail: string;
}

export interface EdgeEntry {
  location: SourceLocation;
  kind: 'export' | 'schema' | 'pin';
  name: string;
  consumers: { repo: string | null; path: string }[];
}

export interface ConfigEntry {
  location: SourceLocation;
  kind: 'infra-file' | 'config-read';
  detail: string;
}

export interface TestsEntry {
  path: string;
  covers: string[];
}

export interface InstructionsEntry {
  path: string;
  loadedBeside: string[];
}

export interface ProseEntry {
  path: string;
  changedLines: number;
  isNew: boolean;
}

export interface CommentDensity {
  commentLines: number;
  codeLines: number;
  perThousand: number;
  target: number;
}

// a line the change adds that claims a type the type checker cannot confirm: a disable comment for a
// rule that bans type assertions, an `any` type, or a call whose result is typed `any`
export interface TypeClaimEntry {
  location: SourceLocation;
  kind: 'cast-disable' | 'any-type' | 'any-value';
  detail: string;
}

// what routing reads to fire the lenses and pick the depth
export interface RiskSignals {
  riskClasses: string[];
  detectors: string[];
  packagesTouched: number;
  consumerEdges: number;
  changedLines: number;
  deletedLines: number;
  breaking: boolean;
  pastEscapes: string[];
}

// the static stage's output that the lenses read, one part per lens concern
export interface Slices {
  functions: FunctionEntry[];
  reuse: ReuseEntry[];
  guards: GuardEntry[];
  throws: ThrowEntry[];
  writes: WriteEntry[];
  security: SecurityEntry[];
  edges: EdgeEntry[];
  config: ConfigEntry[];
  tests: TestsEntry[];
  instructions: InstructionsEntry[];
  prose: ProseEntry[];
  comments: CommentDensity;
  typeClaims: TypeClaimEntry[];

  // each script the change adds that no package.json script and no workflow names
  scripts: string[];
  interfaces: SourceLocation[];
  migrations: string[];
  events: SourceLocation[];
}
