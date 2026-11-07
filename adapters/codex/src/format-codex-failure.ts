import { z } from 'zod';
import { parseJSONLine } from './parse-json-line';

const TAIL_CHARACTERS = 500;
const ERROR_PREFIX = 'ERROR:';

// with --json, Codex prints its own error, such as a usage limit, as events on stdout and leaves
// stderr empty; without it, Codex prints the error on stderr as an `ERROR:` line
const errorSchema = z
  .looseObject({ type: z.literal('error'), message: z.string() })
  .transform((event) => event.message);

const turnFailedSchema = z
  .looseObject({ type: z.literal('turn.failed'), error: z.looseObject({ message: z.string() }) })
  .transform((event) => event.error.message);

const errorEventSchema = z.union([errorSchema, turnFailedSchema]);

export function formatCodexFailure(stdout: string, stderr: string): string {
  const eventMessages = stdout
    .split('\n')
    .map((line) => errorEventSchema.safeParse(parseJSONLine(line)))
    .flatMap((event) => (event.success ? [event.data] : []));

  const stderrLines = stderr.split('\n');

  const stderrMessages = stderrLines
    .filter((line) => isErrorLine(line))
    .map((line) => line.trim().slice(ERROR_PREFIX.length).trim());

  const messageText = [...new Set([...eventMessages, ...stderrMessages])]
    .join('; ')
    .slice(-TAIL_CHARACTERS);

  const stderrTail = stderrLines
    .filter((line) => !isErrorLine(line))
    .join('\n')
    .trim()
    .slice(-TAIL_CHARACTERS);

  return [messageText, stderrTail].filter((part) => part !== '').join('; ');
}

function isErrorLine(line: string): boolean {
  return line.trimStart().startsWith(ERROR_PREFIX);
}
