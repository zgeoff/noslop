import type { AdapterOptions, ReviewAdapter } from '@noslop/contract';

// an adapter with the config's options for it: its timeout replaces the adapter's own, and its model
// runs each call whose lens names no model of its own
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
