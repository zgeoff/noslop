import { z } from 'zod';
import { parseJSONLine } from './parse-json-line';

const STDERR_TAIL_CHARACTERS = 500;
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

export function parseCodexFailure(stdout: string, stderr: string): string {
  const tail = stderr.trim().slice(-STDERR_TAIL_CHARACTERS);

  const events = stdout
    .split('\n')
    .map((line) => errorEventSchema.safeParse(parseJSONLine(line)))
    .flatMap((event) => (event.success ? [event.data] : []));

  const errorLines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(ERROR_PREFIX) && !tail.includes(line))
    .map((line) => line.slice(ERROR_PREFIX.length).trim());

  return [...new Set([...events, ...errorLines]), tail].filter((part) => part !== '').join('; ');
}
