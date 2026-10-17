import type { RunOptions, RunResult, Runner } from '@noslop/runner';

export interface StubAnswer {
  argv: readonly string[];
  result: Partial<RunResult>;
}

export interface RecordedRun {
  argv: readonly string[];
  options: RunOptions;
}

export interface StubRunner {
  runner: Runner;
  runs: RecordedRun[];
}

// a stand-in for the process runner: each run takes the first unused answer whose argv starts with
// the answer's argv, and a run with no answer left rejects, so a test sees every spawn it did not plan
export function buildStubRunner(answers: readonly StubAnswer[]): StubRunner {
  const unused = [...answers];
  const runs: RecordedRun[] = [];

  return {
    runs,
    runner: {
      run: (argv, options) => {
        runs.push({ argv, options });

        const index = unused.findIndex((answer) => hasPrefix(argv, answer.argv));

        if (index === -1) {
          return Promise.reject(new Error(`no stub answer for: ${argv.join(' ')}`));
        }

        const [answer] = unused.splice(index, 1);

        return Promise.resolve({
          exitCode: 0,
          stdout: '',
          stderr: '',
          timedOut: false,
          durationMs: 0,
          ...answer?.result,
        });
      },
    },
  };
}

function hasPrefix(argv: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((part, index) => argv[index] === part);
}
