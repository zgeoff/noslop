import type { CallOutput, CallRequest, ReviewAdapter } from '@noslop/contract';

// one answer to one attempt of a call: the call's output, or the message of the error it throws
export type StubCallAnswer = CallOutput | { error: string };

export interface StubAdapter {
  adapter: ReviewAdapter;

  // every request the adapter received, in order
  requests: CallRequest[];
}

// a model adapter that answers each call from the answers listed under its call ID, one per attempt,
// in order; a call with no answer left throws, so a test sees each call it did not expect
export function buildStubAdapter(
  answers: Readonly<Record<string, readonly StubCallAnswer[]>>,
): StubAdapter {
  const requests: CallRequest[] = [];

  const used = new Map<string, number>();

  return {
    requests,
    adapter: {
      id: 'stub',
      defaultTimeoutMs: 1000,
      efforts: { low: 'low', medium: 'medium', high: 'high' },
      runCall: (call) => {
        requests.push(call);

        const index = used.get(call.callID) ?? 0;
        const answer = answers[call.callID]?.[index];

        used.set(call.callID, index + 1);

        if (answer === undefined) {
          return Promise.reject(
            new Error(`the stub adapter has no answer ${index + 1} for call ${call.callID}`),
          );
        }

        if ('error' in answer) {
          return Promise.reject(new Error(answer.error));
        }

        return Promise.resolve({
          output: call.outputSchema.parse(answer),
          model: call.model,
          tokens: { input: 10, output: 5 },
          durationMs: 1,
          exitCode: 0,
        });
      },
    },
  };
}
