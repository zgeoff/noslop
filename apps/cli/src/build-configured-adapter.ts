import type { AdapterOptions, ReviewAdapter } from '@noslop/contract';

export function buildConfiguredAdapter(
  adapter: ReviewAdapter,
  options: AdapterOptions,
): ReviewAdapter {
  return {
    ...adapter,
    defaultTimeoutMs: options.timeoutMs ?? adapter.defaultTimeoutMs,
    runCall: (call, ctx) =>
      adapter.runCall(
        {
          ...call,
          model: call.model ?? options.model ?? null,
          timeoutMs: call.timeoutMs ?? options.timeoutMs ?? null,
        },
        ctx,
      ),
  };
}
