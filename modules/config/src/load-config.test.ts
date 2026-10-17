import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { BUILT_IN_DEFAULTS } from './built-in-defaults';
import { loadConfig } from './load-config';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-config-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it runs the built-in defaults when the repo has no review.json', async () => {
  const ctx = await setupTest();
  const loaded = await loadConfig({ repoDir: ctx.dir });

  expect(loaded).toMatchObject({ config: BUILT_IN_DEFAULTS, chain: [], rules: null });
  expect(loaded.sources['thresholds.lightMaxLines']).toBe('built-in');
});

test('it merges the repo file over its local parent over the defaults', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'shared', 'base.json'),
    JSON.stringify({ lenses: { security: { effort: 'high' } }, report: ['json', 'sqlite'] }),
  );

  await Bun.write(
    join(ctx.dir, 'repo', 'review.json'),
    JSON.stringify({
      extends: '../shared/base.json',
      lenses: { reuse: { model: 'small' } },
      riskClasses: { money: null },
    }),
  );

  const loaded = await loadConfig({ repoDir: join(ctx.dir, 'repo') });

  expect(loaded.config.lenses).toStrictEqual({
    security: { effort: 'high' },
    reuse: { model: 'small' },
  });

  expect(loaded.config.report).toStrictEqual(['json', 'sqlite']);
  expect(Object.keys(loaded.config.riskClasses)).not.toContain('money');

  expect(loaded.chain).toStrictEqual([
    join(ctx.dir, 'shared', 'base.json'),
    join(ctx.dir, 'repo', 'review.json'),
  ]);

  expect(loaded.sources).toMatchObject({
    'lenses.security.effort': join(ctx.dir, 'shared', 'base.json'),
    'lenses.reuse.model': join(ctx.dir, 'repo', 'review.json'),
    'thresholds.lightMaxLines': 'built-in',
  });
});

test('it reads a parent from a github config repo through the remote reader', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'review.json'),
    JSON.stringify({ extends: 'github:example/noslop-config@v1' }),
  );

  const remoteFiles: Record<string, string> = {
    'review.json@v1': JSON.stringify({ rules: './patterns.md', thresholds: { lightMaxLines: 90 } }),
    'patterns.md@v1': '## Context goes last\n\n1. Take the context last.',
  };

  const loaded = await loadConfig({
    repoDir: ctx.dir,
    readRemoteFile: (location) =>
      Promise.resolve(remoteFiles[`${location.path}@${location.ref}`] ?? null),
  });

  expect(loaded.config.thresholds.lightMaxLines).toBe(90);

  expect(loaded.config.rules).toStrictEqual([
    { label: 'patterns.md', path: 'github:example/noslop-config/patterns.md@v1' },
  ]);

  expect(loaded.rules).toStrictEqual([
    { name: 'patterns.md: Context goes last', body: '1. Take the context last.', paths: null },
  ]);
});

test('it loads the rules file named relative to the repo file', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'review.json'), JSON.stringify({ rules: './patterns.md' }));
  await Bun.write(join(ctx.dir, 'patterns.md'), '## No positional booleans\n\n1. Pass an object.');

  const loaded = await loadConfig({ repoDir: ctx.dir });

  expect(loaded.rules).toStrictEqual([
    { name: 'patterns.md: No positional booleans', body: '1. Pass an object.', paths: null },
  ]);
});

test('it loads each file of a rules list, keeping one heading in 2 files apart', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'review.json'),
    JSON.stringify({ rules: ['skills/code/SKILL.md', { path: 'skills/tests/SKILL.md' }] }),
  );

  await Bun.write(join(ctx.dir, 'skills/code/SKILL.md'), '## Naming\n\n1. Start with a verb.');
  await Bun.write(join(ctx.dir, 'skills/tests/SKILL.md'), '## Naming\n\n1. Start with "it".');

  const loaded = await loadConfig({ repoDir: ctx.dir });

  expect(loaded.rules).toStrictEqual([
    { name: 'skills/code/SKILL.md: Naming', body: '1. Start with a verb.', paths: null },
    { name: 'skills/tests/SKILL.md: Naming', body: '1. Start with "it".', paths: null },
  ]);
});

test('it labels the rules of an absolute rules path with the file name alone', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'repo', 'review.json'),
    JSON.stringify({ rules: join(ctx.dir, 'shared', 'patterns.md') }),
  );

  await Bun.write(join(ctx.dir, 'shared', 'patterns.md'), '## Naming\n\n1. Start with a verb.');

  const loaded = await loadConfig({ repoDir: join(ctx.dir, 'repo') });

  expect(loaded.rules).toStrictEqual([
    { name: 'patterns.md: Naming', body: '1. Start with a verb.', paths: null },
  ]);
});

test('it leaves out the sections a rules file entry skips', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'review.json'),
    JSON.stringify({ rules: [{ path: 'SKILL.md', skip: ['Loading the skill'] }] }),
  );

  await Bun.write(
    join(ctx.dir, 'SKILL.md'),
    '## Loading the skill\n\nLoad it first.\n\n## Naming\n\n1. Start with a verb.',
  );

  const loaded = await loadConfig({ repoDir: ctx.dir });

  expect(loaded.rules).toStrictEqual([
    { name: 'SKILL.md: Naming', body: '1. Start with a verb.', paths: null },
  ]);
});

test('it loads each reference of a rules file with the globs that gate it', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'review.json'),
    JSON.stringify({
      rules: [
        { path: 'skills/testing/SKILL.md', references: { 'references/nix.md': ['**/*.nix'] } },
      ],
    }),
  );

  await Bun.write(join(ctx.dir, 'skills/testing/SKILL.md'), '## Loops\n\n1. Use test.each.');

  await Bun.write(
    join(ctx.dir, 'skills/testing/references/nix.md'),
    '## VM tests\n\n1. Boot once.',
  );

  const loaded = await loadConfig({ repoDir: ctx.dir });

  expect(loaded.rules).toStrictEqual([
    { name: 'skills/testing/SKILL.md: Loops', body: '1. Use test.each.', paths: null },
    {
      name: 'skills/testing/references/nix.md: VM tests',
      body: '1. Boot once.',
      paths: ['**/*.nix'],
    },
  ]);
});

test('it reads a repo: rules path from the reviewed repo when a remote parent names it', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'review.json'),
    JSON.stringify({ extends: 'github:example/noslop-config' }),
  );

  await Bun.write(join(ctx.dir, 'skills/code/SKILL.md'), '## Naming\n\n1. Start with a verb.');

  const remoteFiles: Record<string, string> = {
    'review.json': JSON.stringify({ rules: ['repo:skills/code/SKILL.md'] }),
  };

  const loaded = await loadConfig({
    repoDir: ctx.dir,
    readRemoteFile: (location) => Promise.resolve(remoteFiles[location.path] ?? null),
  });

  expect(loaded.rules).toStrictEqual([
    { name: 'skills/code/SKILL.md: Naming', body: '1. Start with a verb.', paths: null },
  ]);
});

test('it fails the load when a file of the rules list does not exist', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'review.json'), JSON.stringify({ rules: ['missing.md'] }));

  expect(loadConfig({ repoDir: ctx.dir })).rejects.toThrowWithMessage(
    Error,
    /the rules file .*missing\.md does not exist/u,
  );
});

test('it gives 2 rules lists that differ only in a file text 2 hashes', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'review.json'), JSON.stringify({ rules: ['a.md'] }));
  await Bun.write(join(ctx.dir, 'a.md'), '## Naming\n\n1. Start with a verb.');

  const first = await loadConfig({ repoDir: ctx.dir });

  await Bun.write(join(ctx.dir, 'a.md'), '## Naming\n\n1. Start with a noun.');

  const second = await loadConfig({ repoDir: ctx.dir });

  expect(first.hash).not.toBe(second.hash);
});

test('it loads the rules file when the repo directory is a relative path', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'review.json'), JSON.stringify({ rules: './patterns.md' }));
  await Bun.write(join(ctx.dir, 'patterns.md'), '## No positional booleans\n\n1. Pass an object.');

  const loaded = await loadConfig({ repoDir: relative(process.cwd(), ctx.dir) });

  expect(loaded.rules).toStrictEqual([
    { name: 'patterns.md: No positional booleans', body: '1. Pass an object.', paths: null },
  ]);
});

test('it fails the load on a cycle in the extends chain', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'review.json'), JSON.stringify({ extends: './a.json' }));
  await Bun.write(join(ctx.dir, 'a.json'), JSON.stringify({ extends: './review.json' }));

  expect(loadConfig({ repoDir: ctx.dir })).rejects.toThrowWithMessage(
    Error,
    /the extends chain has a cycle/u,
  );
});

test('it fails the load when a parent does not exist', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'review.json'), JSON.stringify({ extends: './missing.json' }));

  expect(loadConfig({ repoDir: ctx.dir })).rejects.toThrowWithMessage(Error, /does not exist/u);
});

test('it fails the load when the merged config breaks the schema', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'review.json'),
    JSON.stringify({ lenses: { security: { effort: 'max' } } }),
  );

  expect(loadConfig({ repoDir: ctx.dir })).rejects.toThrowWithMessage(
    Error,
    /lenses\.security\.effort/u,
  );
});

test('it gives 2 loads of the same config the same hash', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'review.json'), JSON.stringify({ report: ['json'] }));

  const loads = await Promise.all([
    loadConfig({ repoDir: ctx.dir }),
    loadConfig({ repoDir: ctx.dir }),
  ]);

  expect(loads[0]?.hash).toBe(loads[1]?.hash ?? '');
});

test.each([
  ['a repo: path above the repo', { rules: ['repo:../outside.md'] }],
  [
    'a reference above its file',
    { rules: [{ path: 'SKILL.md', references: { '../x.md': ['**'] } }] },
  ],
  [
    'an absolute reference',
    { rules: [{ path: 'SKILL.md', references: { '/x/rules.md': ['**'] } }] },
  ],
])('it fails the load on %s', async (_label, config) => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'repo', 'review.json'), JSON.stringify(config));
  await Bun.write(join(ctx.dir, 'repo', 'SKILL.md'), '## Naming\n\n1. Start with a verb.');
  await Bun.write(join(ctx.dir, 'outside.md'), '## Outside\n\n1. Read me.');
  await Bun.write(join(ctx.dir, 'x.md'), '## Outside\n\n1. Read me.');

  expect(loadConfig({ repoDir: join(ctx.dir, 'repo') })).rejects.toThrowWithMessage(
    Error,
    /leaves the folder it is relative to/u,
  );
});
