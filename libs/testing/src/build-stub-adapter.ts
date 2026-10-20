import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { CallOutput, CallRequest, ReviewAdapter } from '@noslop/contract';

// one answer to one attempt of a call: the call's output, which the call's own schema parses, such as
// the findings of a lens call, the groups of the merge pass, the verdict of a fix check or of a
// resolution check, or the message of the error it throws
export type StubCallAnswer =
  | CallOutput
  | { groups: string[][] }
  | { fixed: boolean; reason: string }
  | (CallOutput & { sound: boolean; reason: string })
  | { error: string };

export interface StubAdapter {
  adapter: ReviewAdapter;

  // every request the adapter received, in order
  requests: CallRequest<unknown>[];

  // the files in each request's working directory when the call ran, sorted, so a test sees what a
  // model would read
  seenFiles: string[][];

  // the ID of each call as it answered, in the order the answers came
  ended: string[];
}

// a model adapter that answers each call from the answers listed under its call ID, one per attempt,
// in order; a call with no answer left throws, so a test sees each call it did not expect; a call
// listed in the delays waits that many milliseconds before it answers, so calls can end out of order
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

// the files under a folder, outside git's own folder; a folder that does not exist holds none
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
