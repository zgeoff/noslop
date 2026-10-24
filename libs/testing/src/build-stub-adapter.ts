import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { CallOutput, CallRequest, ReviewAdapter } from '@noslop/contract';

export type StubCallAnswer =
  | CallOutput
  | { groups: string[][] }
  | { fixed: boolean; reason: string }
  | (CallOutput & { sound: boolean; reason: string })
  | { error: string };

export interface StubAdapter {
  adapter: ReviewAdapter;

  requests: CallRequest<unknown>[];

  seenFiles: string[][];

  ended: string[];
}

export function buildStubAdapter(
  answers: Readonly<Record<string, readonly StubCallAnswer[]>>,
  delaysMs: Readonly<Record<string, number>> = {},
): StubAdapter {
  const requests: CallRequest<unknown>[] = [];
  const seenFiles: string[][] = [];
  const ended: string[] = [];

  const used = new Map<string, number>();

  return {
    requests,
    seenFiles,
    ended,
    adapter: {
      id: 'stub',
      defaultTimeoutMs: 1000,
      efforts: { low: 'low', medium: 'medium', high: 'high' },
      runCall: async (call) => {
        requests.push(call);

        const files = await readFiles(call.cwd);

        seenFiles.push(files);

        await Bun.sleep(delaysMs[call.callID] ?? 0);

        ended.push(call.callID);

        const index = used.get(call.callID) ?? 0;
        const answer = answers[call.callID]?.[index];

        used.set(call.callID, index + 1);

        if (answer === undefined) {
          throw new Error(`the stub adapter has no answer ${index + 1} for call ${call.callID}`);
        }

        if ('error' in answer) {
          throw new Error(answer.error);
        }

        return {
          output: call.outputSchema.parse(answer),
          model: call.model,
          tokens: { input: 10, cachedInput: 40, cacheWrite: 2, output: 5 },
          durationMs: 1,
          exitCode: 0,
        };
      },
    },
  };
}

async function readFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true }).catch(
    () => [],
  );

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .filter((path) => path !== '.git' && !path.startsWith(`.git${sep}`))
    .toSorted();
}
