import type { Logger } from '@logtape/logtape';
import type { Reporter, ReviewAdapter } from '@noslop/contract';
import type { GitHubConnection } from '@noslop/github';
import type { Runner } from '@noslop/runner';

export interface CLIContext {
  runner: Runner;
  cwd: string;

  cacheDir: string;

  // A user may clear the cache folder at any time, and the findings store is durable data that other
  // tools read.
  dataDir: string;
  logger: Logger;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  createAdapter: (id: string) => ReviewAdapter;

  createReporter: (id: string, storePath: string | null) => Reporter | null;

  loadGitHubConnection: () => Promise<GitHubConnection>;

  setGitHubAppSlug: (slug: string | null) => void;
  now?: () => Date;
}
