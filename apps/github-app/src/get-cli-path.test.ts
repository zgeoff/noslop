import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createProcessRunner } from './create-process-runner';
import { getCLIPath } from './get-cli-path';

test('it names the bin that the cli dependency installs in the App package, not a cli source file', () => {
  const appDir = join(import.meta.dir, '..');

  expect(getCLIPath()).toBe(join(appDir, 'node_modules', '.bin', 'noslop'));
});

test('it names a noslop bin that runs through the App runner under the Bun config the jobs pass', async () => {
  const repoDir = join(import.meta.dir, '..', '..', '..');

  const result = await createProcessRunner().run(
    ['bun', `--config=${join(repoDir, 'bunfig.toml')}`, getCLIPath(), '--version'],
    { cwd: repoDir },
  );

  expect(result).toStrictEqual({ exitCode: 0, stderr: '' });
});
