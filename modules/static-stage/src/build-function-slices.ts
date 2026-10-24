import type { AnalyzedFile } from './analyzed-file';
import type { FunctionEntry, GuardEntry, ThrowEntry, ValueOrigin, WriteEntry } from './types';

export interface FunctionSlices {
  functions: FunctionEntry[];
  guards: GuardEntry[];
  throws: ThrowEntry[];
  writes: WriteEntry[];
  events: { path: string; startLine: number; endLine: number }[];
}

export function buildFunctionSlices(files: readonly AnalyzedFile[]): FunctionSlices {
  const slices: FunctionSlices = { functions: [], guards: [], throws: [], writes: [], events: [] };

  for (const entry of files) {
    const analysis = entry.analysis;

    if (analysis === null) {
      continue;
    }

    const path = entry.file.path;

    const changed = new Set<number>();

    for (const [index, facts] of analysis.functions.entries()) {
      const isChanged = [...entry.lines.touched].some(
        (line) => line >= facts.startLine && line <= facts.endLine,
      );

      if (!isChanged) {
        continue;
      }

      changed.add(index);

      const calls = analysis.calls.filter((call) => call.functionIndex === index);

      slices.functions.push({
        location: { path, startLine: facts.startLine, endLine: facts.endLine },
        name: facts.name,
        params: facts.params,
        exported: facts.exported,
        isNew: entry.lines.added.has(facts.startLine),
        complexity: facts.complexity,
        ioCalls: [
          ...new Set(calls.filter((call) => call.matches.includes('io')).map((call) => call.name)),
        ],
        writes: [
          ...new Set(
            calls.filter((call) => call.matches.includes('writes')).map((call) => call.name),
          ),
        ],
      });
    }

    for (const guard of analysis.guards) {
      if (!entry.lines.added.has(guard.line)) {
        continue;
      }

      const facts = guard.functionIndex === null ? null : analysis.functions[guard.functionIndex];

      slices.guards.push({
        location: { path, startLine: guard.line, endLine: guard.line },
        kind: guard.kind,
        condition: guard.condition,
        origins: guard.names.map((name) => ({
          name,
          origin: resolveOrigin(name, facts?.declarations),
        })),
      });
    }

    for (const thrown of analysis.throws) {
      if (!entry.lines.added.has(thrown.line)) {
        continue;
      }

      slices.throws.push({
        location: { path, startLine: thrown.line, endLine: thrown.line },
        kind: thrown.kind,
        type: thrown.type,
        nearestCatch:
          thrown.catchLine === null
            ? null
            : { path, startLine: thrown.catchLine, endLine: thrown.catchLine },
      });
    }

    for (const call of analysis.calls) {
      const inChangedFunction = call.functionIndex !== null && changed.has(call.functionIndex);
      const onChangedLine = entry.lines.touched.has(call.line);

      if (!inChangedFunction && !onChangedLine) {
        continue;
      }

      if (call.matches.includes('writes')) {
        slices.writes.push({
          location: { path, startLine: call.line, endLine: call.line },
          call: call.name,
          inTransaction: call.inTransaction,
          eventsBeside: analysis.calls
            .filter(
              (other) =>
                other.functionIndex === call.functionIndex && other.matches.includes('events'),
            )
            .map((other) => other.name),
        });
      }

      if (call.matches.includes('events') && onChangedLine) {
        slices.events.push({ path, startLine: call.line, endLine: call.line });
      }
    }
  }

  return slices;
}

function resolveOrigin(
  name: string,
  declarations: ReadonlyMap<string, { origin: ValueOrigin; from: string | null }> | undefined,
): ValueOrigin {
  let current = declarations?.get(name);

  for (let step = 0; step < 2 && current?.from !== null && current?.from !== undefined; step += 1) {
    current = declarations?.get(current.from) ?? { origin: 'unknown', from: null };
  }

  return current?.origin ?? 'unknown';
}
