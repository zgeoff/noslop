export interface RunOptions {
  cwd: string;
  stdin?: string;
  timeoutMs?: number;
  env?: Readonly<Record<string, string>>;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface Runner {
  run: (argv: readonly string[], options: RunOptions) => Promise<RunResult>;
}

// a process that ignores the stop signal gets this long before the runner kills it outright
const KILL_GRACE_MS = 2000;

// the one place that spawns a process, so a test replaces every spawn by passing a stand-in runner
export function createRunner(): Runner {
  return { run: runProcess };
}

async function runProcess(argv: readonly string[], options: RunOptions): Promise<RunResult> {
  const startedAt = performance.now();

  const proc = Bun.spawn([...argv], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdin: options.stdin === undefined ? 'ignore' : new Blob([options.stdin]),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  let timedOut = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  if (options.timeoutMs !== undefined) {
    timers.push(
      setTimeout(() => {
        timedOut = true;

        proc.kill('SIGTERM');

        timers.push(
          setTimeout(() => {
            proc.kill('SIGKILL');
          }, KILL_GRACE_MS),
        );
      }, options.timeoutMs),
    );
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  for (const timer of timers) {
    clearTimeout(timer);
  }

  return {
    exitCode,
    stdout,
    stderr,
    timedOut,
    durationMs: Math.round(performance.now() - startedAt),
  };
}
