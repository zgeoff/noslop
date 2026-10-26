import type { FindingList } from '@noslop/contract';
import { readFindingList } from '@noslop/github';
import type { CLIContext } from './cli-context';
import { readRepoName } from './read-repo-name';
import { readTrustedState } from './read-trusted-state';
import { resolveRepoDir } from './resolve-repo-dir';

export interface FindingsValues {
  pr: string;
  repo: string | undefined;
  json: boolean;
}

export async function runFindingsCommand(values: FindingsValues, ctx: CLIContext): Promise<number> {
  const number = Number(values.pr);

  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`--pr takes a pull request number, not ${values.pr}`);
  }

  const repo = await resolveRepo(ctx, values.repo);

  const [owner, name] = repo.split('/');

  if (owner === undefined || name === undefined || owner === '' || name === '') {
    throw new Error(`--repo takes owner/name, not ${repo}`);
  }

  const pullRequest = { owner, repo: name, number };

  const trusted = await readTrustedState(pullRequest, {
    load: ctx.loadGitHubConnection,
    setAppSlug: ctx.setGitHubAppSlug,
  });

  if (trusted.state.unreadable > 0) {
    throw new Error(
      `${trusted.state.unreadable} finding comments of the pull request hold a marker noslop cannot read, so it lists no finding`,
    );
  }

  const list = await readFindingList(trusted.connection, pullRequest, trusted.state);

  const output = values.json ? `${JSON.stringify(list, null, 2)}\n` : formatFindingList(list);

  ctx.writeStdout(output);

  return 0;
}

async function resolveRepo(ctx: CLIContext, repo: string | undefined): Promise<string> {
  if (repo !== undefined) {
    return repo;
  }

  const repoDir = await resolveRepoDir(ctx);

  return readRepoName(ctx, repoDir);
}

function formatFindingList(list: FindingList): string {
  if (list.findings.length === 0) {
    return 'noslop findings: none\n';
  }

  return list.findings
    .map(
      (finding) =>
        `${finding.id} ${finding.severity} ${finding.state} ${finding.path}${finding.author === null ? '' : ` (${finding.author})`}${finding.unjudged ? ` unjudged: ${finding.reason}` : ''}\n`,
    )
    .join('');
}
