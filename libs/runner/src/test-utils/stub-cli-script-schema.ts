import { z } from 'zod';

export const stubCLIScriptSchema = z.strictObject({
  recordPath: z.string(),
  outputFlag: z.string().nullable(),
  lastMessage: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.int(),
  delayMs: z.int().nonnegative(),
});

export type StubCLIScript = z.infer<typeof stubCLIScriptSchema>;
