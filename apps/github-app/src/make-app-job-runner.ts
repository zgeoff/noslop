import { join } from 'node:path';
import type { Runner } from './create-process-runner';
import { getCLIPath } from './get-cli-path';
import type { AppEvent } from './parse-app-event';
import type { AppServerEnv } from './parse-app-server-env';
import { runAppJob } from './run-app-job';

interface AppJobDependencies {
  runner: Runner;
  mintToken: (installationID: number) => Promise<string>;
}

export function makeAppJobRunner(
  env: AppServerEnv,
  deps: AppJobDependencies,
): (event: AppEvent) => Promise<void> {
  return (event) =>
    runAppJob(event, {
      runner: deps.runner,
      cliPath: getCLIPath(),
      bunConfigPath: join(import.meta.dir, '..', '..', '..', 'bunfig.toml'),
      reposDir: env.reposDir,
      appID: env.appID,
      privateKey: env.privateKey,
      mintToken: deps.mintToken,
    });
}
