import { dirname, join, normalize } from 'node:path';
import type { ReviewConfig } from '@noslop/contract';
import type { AnalyzedFile } from './analyzed-file';
import { isGlobMatch } from './is-glob-match';
import type {
  CommentDensity,
  ConfigEntry,
  InstructionsEntry,
  ProseEntry,
  SecurityEntry,
  SourceLocation,
  TestsEntry,
} from './types';

export interface FileSlices {
  security: SecurityEntry[];
  config: ConfigEntry[];
  tests: TestsEntry[];
  instructions: InstructionsEntry[];
  prose: ProseEntry[];
  comments: CommentDensity;
  interfaces: SourceLocation[];
  migrations: string[];
}

const MIGRATION_PATH = /(?:^|\/)migrations?\//u;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '/index.ts', '/index.js'];

// cuts the facts that belong to whole files, or to single lines, down to the change; `headPaths`
// holds every path at the head commit, so an instruction file lists the instruction files an agent
// loads beside it and a relative import resolves to the file it names
export function buildFileSlices(
  files: readonly AnalyzedFile[],
  headPaths: readonly string[],
  config: ReviewConfig,
): FileSlices {
  const slices: FileSlices = {
    security: [],
    config: [],
    tests: [],
    instructions: [],
    prose: [],
    comments: {
      commentLines: 0,
      codeLines: 0,
      perThousand: 0,
      target: config.thresholds.commentDensityMax,
    },
    interfaces: [],
    migrations: [],
  };

  const known = new Set(headPaths);

  for (const entry of files) {
    const path = entry.file.path;
    const kind = entry.file.kind;

    if (MIGRATION_PATH.test(path) && entry.file.status !== 'deleted') {
      slices.migrations.push(path);
    }

    if (kind === 'infra') {
      slices.config.push({
        location: { path, startLine: 1, endLine: 1 },
        kind: 'infra-file',
        detail: `${entry.file.status} infra file`,
      });
    }

    if (kind === 'prose' && entry.file.status !== 'deleted') {
      slices.prose.push({
        path,
        changedLines: entry.file.addedLines + entry.file.deletedLines,
        isNew: entry.file.status === 'added',
      });
    }

    if (kind === 'instructions') {
      slices.instructions.push({
        path,
        loadedBeside: collectLoadedBeside(path, headPaths, config),
      });
    }

    if (kind === 'test' && entry.analysis !== null) {
      slices.tests.push({
        path,
        covers: entry.analysis.imports.flatMap((item) => {
          const resolved = resolveImport(path, item.source, known);

          return resolved === null ? [] : [resolved];
        }),
      });
    }

    collectLineFacts(entry, slices);
  }

  slices.comments.perThousand =
    slices.comments.codeLines === 0
      ? 0
      : Math.round((slices.comments.commentLines * 1000) / slices.comments.codeLines);

  return slices;
}

function collectLineFacts(entry: AnalyzedFile, slices: FileSlices): void {
  const analysis = entry.analysis;
  const parsed = entry.parsed;
  const path = entry.file.path;

  if (analysis === null || parsed === null) {
    return;
  }

  for (const item of analysis.security) {
    if (entry.lines.touched.has(item.line)) {
      slices.security.push({
        location: { path, startLine: item.line, endLine: item.line },
        part: item.part,
        detail: item.detail,
      });
    }
  }

  for (const read of analysis.configReads) {
    if (entry.lines.added.has(read.line)) {
      slices.config.push({
        location: { path, startLine: read.line, endLine: read.line },
        kind: 'config-read',
        detail: `reads ${read.name}`,
      });
    }
  }

  for (const declared of analysis.types) {
    if (declared.exported && entry.lines.added.has(declared.startLine)) {
      slices.interfaces.push({ path, startLine: declared.startLine, endLine: declared.endLine });
    }
  }

  if (entry.file.kind !== 'code') {
    return;
  }

  const commentLines = new Set<number>();

  for (const comment of parsed.comments) {
    for (let line = comment.startLine; line <= comment.endLine; line += 1) {
      commentLines.add(line);
    }
  }

  for (const line of entry.lines.added) {
    slices.comments.codeLines += 1;
    slices.comments.commentLines += Number(commentLines.has(line));
  }
}

// an agent loads every instruction file in the directories from the repo root down to the file's own
// directory, so each of those sits beside a changed one
function collectLoadedBeside(
  path: string,
  headPaths: readonly string[],
  config: ReviewConfig,
): string[] {
  const own = dirname(path);

  return headPaths.filter((other) => {
    if (other === path || !isGlobMatch(other, config.instructions)) {
      return false;
    }

    const otherDir = dirname(other);

    return otherDir === '.' || own === otherDir || own.startsWith(`${otherDir}/`);
  });
}

function resolveImport(
  fromPath: string,
  source: string,
  known: ReadonlySet<string>,
): string | null {
  if (!source.startsWith('.')) {
    return null;
  }

  const base = normalize(join(dirname(fromPath), source));

  if (known.has(base)) {
    return base;
  }

  const found = SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`).find((candidate) =>
    known.has(candidate),
  );

  return found ?? null;
}
