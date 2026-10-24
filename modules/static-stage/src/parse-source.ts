import { parseSync } from 'oxc-parser';
import type { ASTNode } from './ast-node';
import { isASTNode } from './ast-node';

export interface ParsedSource {
  path: string;
  text: string;
  program: ASTNode;
  comments: { kind: 'line' | 'block'; text: string; startLine: number; endLine: number }[];
  hasErrors: boolean;
  getLine: (offset: number) => number;
}

const PARSEABLE = /\.(?:[cm]?[jt]sx?)$/u;

// oxc recovers a tree from a file with syntax errors, so the errors are no reason to return null
export function parseSource(path: string, text: string): ParsedSource | null {
  if (!PARSEABLE.test(path)) {
    return null;
  }

  const result = parseSync(path, text);
  const program: unknown = result.program;

  if (!isASTNode(program)) {
    return null;
  }

  const lineStarts = buildLineStarts(text);
  const getLine = (offset: number): number => getLineNumber(lineStarts, offset);

  return {
    path,
    text,
    program,
    comments: result.comments.map((comment) => ({
      kind: comment.type === 'Line' ? 'line' : 'block',
      text: comment.value,
      startLine: getLine(comment.start),
      endLine: getLine(comment.end),
    })),
    hasErrors: result.errors.length > 0,
    getLine,
  };
}

function buildLineStarts(text: string): number[] {
  const starts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text.codePointAt(index) === 10) {
      starts.push(index + 1);
    }
  }

  return starts;
}

function getLineNumber(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);

    if ((lineStarts[middle] ?? 0) <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low + 1;
}
