import { WringerError } from '@wringer/core';
import { parseGitHubTokenEnv } from '../../adapters/github/src/index.ts';

export type Env = Readonly<Record<string, string | undefined>>;

export interface SandboxEnv {
  owner: string;
  repo: string;

  // the author's token: it pushes the branches, opens and closes the pull request, and answers
  token: string;
}

export const sandboxRepoEnv = 'NOSLOP_VERIFY_REPO';

export function parseSandboxEnv(env: Env): SandboxEnv {
  const match = /^(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)$/u.exec(env[sandboxRepoEnv] ?? '');
  const owner = match?.groups?.['owner'];
  const repo = match?.groups?.['repo'];

  if (owner === undefined || repo === undefined) {
    throw new WringerError('environment', {
      message: `${sandboxRepoEnv} must name the sandbox repo as owner/name`,
      hint: `Set ${sandboxRepoEnv} to a repo where the noslop App is installed, then run \`bun verify up --restart\`.`,
    });
  }

  const token = parseGitHubTokenEnv(env);

  if (token === null) {
    throw new WringerError('environment', {
      message: 'set GH_TOKEN or GITHUB_TOKEN to a token that may push to the sandbox repo',
      hint: 'Set the token, then run `bun verify up --restart`.',
    });
  }

  return { owner, repo, token };
}
