import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { WringerError } from '@wringer/core';
import { createGitHubConnection } from '../../adapters/github/src/index.ts';
import type { SandboxEnv } from './parse-sandbox-env.ts';
import type { Adapter } from './read-run-state.ts';
import { readRunState } from './read-run-state.ts';
import type { RunEndpoints } from './run-endpoints.ts';
import { runGit } from './run-git.ts';
import { sandboxSeed } from './sandbox-seed.ts';
import { writeRunState } from './write-run-state.ts';

// The credential helper reads the token from the environment of each git process, so the token
// never lands in the clone's config.
const credentialHelper =
  '!f() { test "$1" = get && echo username=x-access-token && echo "password=$GH_TOKEN"; }; f';

// Pushes an orphan base branch with the seed and a `review.json` that picks the adapter, and a head
// branch with the seeded defect, then opens the pull request from head to base. The run owns the
// branches, so no other run's config or pull request changes.
export async function createSandboxPullRequest(
  endpoints: RunEndpoints,
  sandbox: SandboxEnv,
  adapter: Adapter,
): Promise<{ pullRequest: number; url: string }> {
  const state = await readRunState(endpoints);

  if (state !== null && state.stage !== 'closed') {
    throw new WringerError('check-failed', {
      message: `the run's pull request #${String(state.pullRequest)} is still open`,
      hint: 'Run `bun verify action close-pull-request` first.',
    });
  }

  const branches = getRunBranches(endpoints);
  const git = (args: readonly string[]) => runGit(endpoints.clone, args, sandbox.token);

  await rm(endpoints.clone, { recursive: true, force: true });
  await mkdir(endpoints.clone, { recursive: true });
  await git(['init', '--quiet']);
  await git(['config', 'user.name', 'noslop verify']);
  await git(['config', 'user.email', 'verify@noslop.invalid']);
  await git(['config', 'credential.helper', credentialHelper]);
  await git(['remote', 'add', 'origin', `https://github.com/${sandbox.owner}/${sandbox.repo}.git`]);
  await git(['switch', '--quiet', '--orphan', branches.base]);

  await writeFiles(endpoints.clone, {
    ...sandboxSeed.base.files,
    'review.json': `${JSON.stringify({ adapter }, null, 2)}\n`,
  });

  await git(['add', '--all']);
  await git(['commit', '--quiet', '--message', sandboxSeed.base.message]);
  await git(['switch', '--quiet', '--create', branches.head]);
  await writeFiles(endpoints.clone, sandboxSeed.defect.files);
  await git(['add', '--all']);

  await git([
    'commit',
    '--quiet',
    '--message',
    sandboxSeed.defect.title,
    '--message',
    sandboxSeed.defect.body,
  ]);

  await git(['push', '--quiet', 'origin', branches.base, branches.head]);

  const connection = await createGitHubConnection(null, sandbox.token);

  const created = await connection.client.request('POST /repos/{owner}/{repo}/pulls', {
    owner: sandbox.owner,
    repo: sandbox.repo,
    title: sandboxSeed.defect.title,
    body: sandboxSeed.defect.body,
    head: branches.head,
    base: branches.base,
  });

  await writeRunState(endpoints, { stage: 'opened', pullRequest: created.data.number, adapter });

  return { pullRequest: created.data.number, url: created.data.html_url };
}

export function getRunBranches(endpoints: RunEndpoints): { base: string; head: string } {
  return { base: `verify/${endpoints.run}/base`, head: `verify/${endpoints.run}/head` };
}

async function writeFiles(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });

    await Bun.write(join(root, path), text);
  }
}
