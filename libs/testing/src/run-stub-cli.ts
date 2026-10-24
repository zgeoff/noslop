import { z } from 'zod';

const scriptSchema = z.strictObject({
  recordPath: z.string(),
  outputFlag: z.string().nullable(),
  lastMessage: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.int(),
  delayMs: z.int().nonnegative(),
});

export type StubCLIScript = z.infer<typeof scriptSchema>;

const scriptPath = Bun.env['NOSLOP_STUB_SCRIPT'];

if (scriptPath !== undefined && import.meta.main) {
  const raw: unknown = await Bun.file(scriptPath).json();

  const script = scriptSchema.parse(raw);
  const args = Bun.argv.slice(2);

  const stdin = await Bun.stdin.text();

  await Bun.write(script.recordPath, JSON.stringify({ args, stdin }));

  const flagIndex = script.outputFlag === null ? -1 : args.indexOf(script.outputFlag);
  const outputPath = flagIndex === -1 ? undefined : args[flagIndex + 1];

  if (outputPath !== undefined && script.lastMessage !== null) {
    await Bun.write(outputPath, script.lastMessage);
  }

  await Bun.sleep(script.delayMs);

  process.stdout.write(script.stdout);
  process.stderr.write(script.stderr);
  process.exit(script.exitCode);
}
