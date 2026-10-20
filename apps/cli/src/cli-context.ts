import type { Logger } from '@logtape/logtape';
import type { Reporter, ReviewAdapter } from '@noslop/contract';
import type { GitHubConnection } from '@noslop/github';
import type { Runner } from '@noslop/runner';

// what each command reads from the world, so a test runs a command on a temp repo with its own
// adapter and captures what the command prints
export interface CLIContext {
  runner: Runner;
  cwd: string;

  // the user's cache folder for noslop: the temp folder of each review and the base index live here
  cacheDir: string;

  // the user's data folder for noslop, which holds the findings store; a user may clear the cache
  // at any time, and the store is durable data that other tools read
  dataDir: string;
  logger: Logger;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  createAdapter: (id: string) => ReviewAdapter;

  // the reporter with the id, or null when noslop has none by that id; the store path is the one the
  // run's sqlite reporter writes, or null when the run lists no sqlite reporter
  createReporter: (id: string, storePath: string | null) => Reporter | null;

  // a GitHub connection, as the App's installation when the environment holds one
  loadGitHubConnection: () => Promise<GitHubConnection>;
  now?: () => Date;
}
