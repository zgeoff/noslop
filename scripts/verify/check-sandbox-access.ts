import { WringerError } from '@wringer/core';
import { createGitHubConnection } from '../../adapters/github/src/index.ts';
import { createAppConnection } from './create-app-connection.ts';
import { parseSandboxEnv, sandboxRepoEnv } from './parse-sandbox-env.ts';
import type { Env } from './parse-sandbox-env.ts';

// The App's installation can read the sandbox repo, and the author's token may push to it.
export async function checkSandboxAccess(env: Env): Promise<{ repo: string }> {
  const sandbox = parseSandboxEnv(env);
  const repo = `${sandbox.owner}/${sandbox.repo}`;
  const params = { owner: sandbox.owner, repo: sandbox.repo };

  const app = await createAppConnection(env);

  await app.client.request('GET /repos/{owner}/{repo}', params).catch(() => {
    throw new WringerError('check-failed', {
      message: `the App's installation cannot read ${repo}`,
      hint: `Install the App on the repo that ${sandboxRepoEnv} names, or name a repo it is installed on.`,
    });
  });

  const author = await createGitHubConnection(null, sandbox.token);
  const read = await author.client.request('GET /repos/{owner}/{repo}', params).catch(() => null);

  if (read?.data.permissions?.push !== true) {
    throw new WringerError('check-failed', {
      message: `the token in GH_TOKEN or GITHUB_TOKEN may not push to ${repo}`,
      hint: 'Use a token with write access to the sandbox repo.',
    });
  }

  return { repo };
}
