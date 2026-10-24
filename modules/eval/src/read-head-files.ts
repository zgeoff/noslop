import type { Runner } from '@noslop/runner';
import type { Case } from './case';

export async function readHeadFiles(corpusCase: Case, runner: Runner): Promise<string[]> {
  const result = await runner
    .run(['git', 'ls-tree', '-r', '-z', '--name-only', corpusCase.head], { cwd: corpusCase.repo })
    .catch(() => null);

  if (result === null || result.exitCode !== 0) {
    return [];
  }

  return result.stdout.split('\0').filter((path) => path !== '');
}
