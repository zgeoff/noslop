import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CallRequest, CallResult, ReviewAdapter } from '@noslop/contract';
import { buildCallOutputJSONSchema } from '@noslop/contract';
import type { Runner } from '@noslop/runner';
import { z } from 'zod';

export interface CodexAdapterOptions {
  runner: Runner;

  // the Codex executable, `codex` on the path unless a caller names another
  command?: string;

  // the folder that holds the user's Codex config, whose developer instructions the adapter extends
  codexHome?: string;
}

const NOSLOP_INSTRUCTIONS = [
  'You are a code reviewer, and you only read.',
  'Change no file, run no test, no build and no repo script, and reach no network.',
  'Read the files you need with read-only commands, and answer in the output schema.',
].join(' ');

// the Codex features that run code, write, or reach past the model provider outside the sandbox
const DISABLED_FEATURES = [
  'apps',
  'browser_use',
  'browser_use_external',
  'computer_use',
  'hooks',
  'image_generation',
  'plugins',
  'remote_plugin',
  'skill_mcp_dependency_install',
];

const BARE_KEY = /^[\w-]+$/u;

const usageSchema = z.looseObject({
  type: z.literal('turn.completed'),
  usage: z.looseObject({ input_tokens: z.int(), output_tokens: z.int() }),
});

const configSchema = z.looseObject({
  developer_instructions: z.string().optional(),
  mcp_servers: z.record(z.string(), z.unknown()).optional(),
});

// runs a call on `codex exec` in its read-only sandbox, with the output schema on Codex's own schema
// flag; the call's prompt goes on stdin, and noslop's instructions follow the user's own developer
// instructions, so a user's setup keeps applying
export function createCodexAdapter(options: CodexAdapterOptions): ReviewAdapter {
  const adapter: ReviewAdapter = {
    id: 'codex',
    defaultTimeoutMs: 1_200_000,
    efforts: { low: 'low', medium: 'medium', high: 'high' },
    runCall: async (call, ctx) => {
      const dir = await mkdtemp(join(ctx.tempDir, `codex-${call.callID}-`));

      try {
        return await runCodexCall(call, dir, adapter, options);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };

  return adapter;
}

async function runCodexCall(
  call: CallRequest,
  dir: string,
  adapter: ReviewAdapter,
  options: CodexAdapterOptions,
): Promise<CallResult> {
  const schemaPath = join(dir, 'output-schema.json');
  const lastPath = join(dir, 'last-message.json');

  const userConfig = await readCodexConfig(join(readCodexHome(options), 'config.toml'));

  // an MCP server runs outside the sandbox, so each one the user's or the reviewed repo's config
  // names is turned off; the repo's own instructions stay out, because the change under review
  // writes them
  const repoConfig = await readCodexConfig(join(call.cwd, '.codex', 'config.toml'));

  const servers = [
    ...new Set([
      ...Object.keys(userConfig.mcp_servers ?? {}),
      ...Object.keys(repoConfig.mcp_servers ?? {}),
    ]),
  ];

  const instructions = (userConfig.developer_instructions ?? '').trim();

  // Codex reads a `-c` key path segment by segment and takes no quoted segment, so a server with any
  // other name cannot be turned off, and the call refuses to start
  const unsafe = servers.find((name) => !BARE_KEY.test(name));

  if (unsafe !== undefined) {
    throw new Error(
      `codex has an MCP server named ${JSON.stringify(unsafe)} that noslop cannot turn off`,
    );
  }

  await Bun.write(schemaPath, JSON.stringify(buildCallOutputJSONSchema(call.lenses)));

  const argv = [
    options.command ?? 'codex',
    'exec',
    '--sandbox',
    'read-only',
    '--ephemeral',
    '--skip-git-repo-check',
    '--json',
    '--output-schema',
    schemaPath,
    '-o',
    lastPath,
    '-C',
    call.cwd,
    '-c',
    `model_reasoning_effort=${JSON.stringify(adapter.efforts[call.effort])}`,
    '-c',
    `developer_instructions=${JSON.stringify([instructions, NOSLOP_INSTRUCTIONS].filter((part) => part !== '').join('\n\n'))}`,
    '-c',
    'notify=[]',
    ...DISABLED_FEATURES.flatMap((feature) => ['-c', `features.${feature}=false`]),
    ...servers.flatMap((name) => ['-c', `mcp_servers.${name}.enabled=false`]),
    ...(call.model === null ? [] : ['-m', call.model]),
    '-',
  ];

  const result = await options.runner.run(argv, {
    cwd: call.cwd,
    stdin: call.prompt,
    timeoutMs: call.timeoutMs ?? adapter.defaultTimeoutMs,
  });

  if (result.timedOut) {
    throw new Error(`codex timed out after ${result.durationMs} ms on call ${call.callID}`);
  }

  if (result.exitCode !== 0) {
    throw new Error(
      `codex exited ${result.exitCode} on call ${call.callID}: ${result.stderr.trim().slice(-500)}`,
    );
  }

  const text = await Bun.file(lastPath)
    .text()
    .catch(() => '');

  const output = call.outputSchema.parse(JSON.parse(text));

  return {
    output,
    model: call.model,
    tokens: countTokens(result.stdout),
    durationMs: result.durationMs,
    exitCode: result.exitCode,
  };
}

function readCodexHome(options: CodexAdapterOptions): string {
  return options.codexHome ?? Bun.env['CODEX_HOME'] ?? join(homedir(), '.codex');
}

async function readCodexConfig(path: string): Promise<z.infer<typeof configSchema>> {
  const text = await Bun.file(path)
    .text()
    .catch(() => '');

  const parsed = configSchema.safeParse(parseTOML(text));

  return parsed.success ? parsed.data : {};
}

// a config that Codex itself cannot read leaves the user no instructions to keep
function parseTOML(text: string): unknown {
  try {
    return Bun.TOML.parse(text);
  } catch {
    return {};
  }
}

// Codex prints one JSON event per line, and each finished turn reports its token use
function countTokens(stdout: string): CallResult['tokens'] {
  const tokens = { input: 0, output: 0 };

  for (const line of stdout.split('\n')) {
    const event = usageSchema.safeParse(parseJSONLine(line));

    if (event.success) {
      tokens.input += event.data.usage.input_tokens;
      tokens.output += event.data.usage.output_tokens;
    }
  }

  return tokens;
}

function parseJSONLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
