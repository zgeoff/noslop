import { expect, test } from 'bun:test';
import { join } from 'node:path';
import releaseConfig from './release-please-config.json' with { type: 'json' };

test("it gives the shared release job the branch release-please names after the CLI's component", async () => {
  const text = await Bun.file(join(import.meta.dir, '.github/workflows/main.yml')).text();

  const workflow: unknown = Bun.YAML.parse(text);

  expect(workflow).toMatchObject({
    jobs: {
      release: {
        with: {
          'release-branch': `release-please--branches--main--components--${releaseConfig.packages['.'].component}`,
        },
      },
    },
  });
});
