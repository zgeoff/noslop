import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RunOptions, Runner } from '@noslop/runner';
import type { AppEvent } from './parse-app-event';

export interface AppJobOptions {
  runner: Runner;

  // the noslop CLI's entry file, which the job runs with Bun
  cliPath: string;

  // the folder that holds a clone of each repo the App reviews
  reposDir: string;
  appID: number;
  privateKey: string;
  mintToken: (installationID: number) => Promise<string>;
}

// runs one App event through the noslop CLI: a review fetches the pull request into the repo's clone
// and reviews it, posting through the App; a check sets the check run again; the installation token
// reaches git through the environment, so it never lands in a command line or the clone's config
export async function runAppJob(event: AppEvent, options: AppJobOptions): Promise<void> {
  const repo = `${event.owner}/${event.repo}`;

  const cliEnv = {
    NOSLOP_GITHUB_APP_ID: String(options.appID),
    NOSLOP_GITHUB_APP_PRIVATE_KEY: options.privateKey,
    NOSLOP_GITHUB_APP_INSTALLATION_ID: String(event.installationID),
  };

  if (event.kind === 'check') {
    await runChecked(
      options.runner,
      ['bun', options.cliPath, 'check', '--pr', String(event.number), '--repo', repo],
      {
        cwd: options.reposDir,
        env: cliEnv,
      },
    );

    return;
  }

  const token = await options.mintToken(event.installationID);

  const gitEnv = buildGitAuthEnv(token);
  const clone = join(options.reposDir, event.owner, event.repo);

  await (existsSync(join(clone, '.git'))
    ? runChecked(options.runner, ['git', 'fetch', '--quiet', 'origin'], { cwd: clone, env: gitEnv })
    : runChecked(
        options.runner,
        ['git', 'clone', '--quiet', `https://github.com/${repo}.git`, clone],
        {
          cwd: options.reposDir,
          env: gitEnv,
        },
      ));

  await runChecked(
    options.runner,
    ['git', 'fetch', '--quiet', 'origin', `pull/${event.number}/head`],
    { cwd: clone, env: gitEnv },
  );

  await runChecked(
    options.runner,
    [
      'bun',
      options.cliPath,
      'review',
      '--pr',
      String(event.number),
      '--repo',
      repo,
      '--report',
      'github',
    ],
    { cwd: clone, env: { ...cliEnv, ...gitEnv } },
  );
}

async function runChecked(
  runner: Runner,
  argv: readonly string[],
  options: RunOptions,
): Promise<void> {
  const result = await runner.run(argv, options);

  if (result.exitCode !== 0) {
    throw new Error(
      `${argv.slice(0, 3).join(' ')} exited ${result.exitCode}: ${result.stderr.trim()}`,
    );
  }
}

// git reads config from GIT_CONFIG_COUNT and its pairs, so the token's header reaches every request to
// GitHub without an argument other processes can list
function buildGitAuthEnv(token: string): Record<string, string> {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');

  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    GIT_TERMINAL_PROMPT: '0',
  };
}
