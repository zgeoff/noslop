import { z } from 'zod';

// The paths of one run, which the ready line of the `local` target's launch process prints, and
// which every action, command and check reads from the run's endpoints.
const runEndpointsSchema = z.object({
  root: z.string().min(1),

  // the folder the run commits in and pushes from, and where each `noslop` process runs
  clone: z.string().min(1),

  // an empty Bun config, so no preload in a repo's bunfig.toml can read the App's keys
  bunfig: z.string().min(1),

  // the 8 hex characters of the run's branch prefix, `verify/<run>/`, in the sandbox
  run: z.string().regex(/^[0-9a-f]{8}$/u),
});

export type RunEndpoints = z.infer<typeof runEndpointsSchema>;

export function parseRunEndpoints(value: unknown): RunEndpoints {
  return runEndpointsSchema.parse(value);
}
