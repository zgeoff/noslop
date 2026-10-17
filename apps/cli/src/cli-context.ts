import type { Logger } from '@logtape/logtape';
import type { Reporter, ReviewAdapter } from '@noslop/contract';
import type { Runner } from '@noslop/runner';

// what each command reads from the world, so a test runs a command on a temp repo with its own
// adapter and captures what the command prints
export interface CLIContext {
  runner: Runner;
  cwd: string;

  // the user's cache folder for noslop: the temp folder of each review and the base index live here
  cacheDir: string;
  logger: Logger;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  createAdapter: (id: string) => ReviewAdapter;

  // the reporter with the id, or null when noslop has none by that id
  createReporter: (id: string) => Reporter | null;
  now?: () => Date;
}
