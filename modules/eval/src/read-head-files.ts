import type { Runner } from '@noslop/runner';
import type { Case } from './case';

// the paths of every file at the case's head, which its labels resolve against; a missing clone, or
// one that lacks the head, holds none, so the labels stay as written and the replay records the failure
export async function readHeadFiles(corpusCase: Case, runner: Runner): Promise<string[]> {
  const result = await runner
    .run(['git', 'ls-tree', '-r', '-z', '--name-only', corpusCase.head], { cwd: corpusCase.repo })
    .catch(() => null);

  if (result === null || result.exitCode !== 0) {
    return [];
  }

  return result.stdout.split('\0').filter((path) => path !== '');
}
