export interface RunOptions {
  cwd: string;
  env?: Readonly<Record<string, string>>;
}

interface RunResult {
  exitCode: number;
  stderr: string;
}

export interface Runner {
  run: (argv: readonly string[], options: RunOptions) => Promise<RunResult>;
}

// the one place the App spawns a process, git or the noslop CLI, so a test replaces every spawn by
// passing a stand-in runner
export function createProcessRunner(): Runner {
  return { run: runProcess };
}

// the variables that point git at one repo whatever folder it runs in, which a child git must not
// inherit, so it finds its repo from its own working directory
const GIT_REPO_VARIABLES = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
] as const;

// a child starts from the server's environment with the given variables over it
async function runProcess(argv: readonly string[], options: RunOptions): Promise<RunResult> {
  const env: Record<string, string | undefined> = { ...process.env, ...options.env };

  for (const name of GIT_REPO_VARIABLES) {
    delete env[name];
  }

  const proc = Bun.spawn([...argv], {
    cwd: options.cwd,
    env,
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe',
  });

  const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

  return { exitCode, stderr };
}
