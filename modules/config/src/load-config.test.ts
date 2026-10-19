import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { BUILT_IN_DEFAULTS } from './built-in-defaults';
import { loadConfig } from './load-config';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-config-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it runs the built-in defaults when the repo has no review.json', async () => {
  const ctx = await setupTest();
  const loaded = await loadConfig({ repoDir: ctx.directory });

  expect(loaded).toMatchObject({ config: BUILT_IN_DEFAULTS, chain: [], rules: null });
  expect(loaded.sources['thresholds.lightMaxLines']).toBe('built-in');
});

test('it returns only the config, sources, chain, rules, missing rules and hash', async () => {
  const ctx = await setupTest();
  const loaded = await loadConfig({ repoDir: ctx.directory });

  expect(loaded).toContainAllKeys(['config', 'sources', 'chain', 'rules', 'missingRules', 'hash']);
});

test('it merges the repo file over its local parent over the defaults', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'shared', 'base.json'),
    JSON.stringify({ lenses: { security: { effort: 'high' } }, report: ['json', 'sqlite'] }),
  );

  await Bun.write(
    join(ctx.directory, 'repo', 'review.json'),
    JSON.stringify({
      extends: '../shared/base.json',
      lenses: { reuse: { model: 'small' } },
      riskClasses: { money: null },
    }),
  );

  const loaded = await loadConfig({ repoDir: join(ctx.directory, 'repo') });

  expect(loaded.config.lenses).toStrictEqual({
    security: { effort: 'high' },
    reuse: { model: 'small' },
  });

  expect(loaded.config.report).toStrictEqual(['json', 'sqlite']);
  expect(Object.keys(loaded.config.riskClasses)).not.toContain('money');

  expect(loaded.chain).toStrictEqual([
    join(ctx.directory, 'shared', 'base.json'),
    join(ctx.directory, 'repo', 'review.json'),
  ]);

  expect(loaded.sources).toMatchObject({
    'lenses.security.effort': join(ctx.directory, 'shared', 'base.json'),
    'lenses.reuse.model': join(ctx.directory, 'repo', 'review.json'),
    'thresholds.lightMaxLines': 'built-in',
  });
});

test('it reads a parent from a github config repo through the remote reader', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({ extends: 'github:example/noslop-config@v1' }),
  );

  const remoteFiles: Record<string, string> = {
    'review.json@v1': JSON.stringify({ rules: './patterns.md', thresholds: { lightMaxLines: 90 } }),
    'patterns.md@v1': '## Context goes last\n\n1. Take the context last.',
  };

  const loaded = await loadConfig({
    repoDir: ctx.directory,
    readRemoteFile: (location) =>
      Promise.resolve(remoteFiles[`${location.path}@${location.ref}`] ?? null),
  });

  expect(loaded.config.thresholds.lightMaxLines).toBe(90);

  expect(loaded.config.rules).toStrictEqual([
    { label: 'patterns.md', path: 'github:example/noslop-config/patterns.md@v1' },
  ]);

  expect(loaded.rules).toStrictEqual([
    { name: 'patterns.md', body: '## Context goes last\n\n1. Take the context last.', paths: null },
  ]);
});

test('it loads the rules file named relative to the repo file', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'review.json'), JSON.stringify({ rules: './patterns.md' }));

  await Bun.write(
    join(ctx.directory, 'patterns.md'),
    '## No positional booleans\n\n1. Pass an object.',
  );

  const loaded = await loadConfig({ repoDir: ctx.directory });

  expect(loaded.rules).toStrictEqual([
    { name: 'patterns.md', body: '## No positional booleans\n\n1. Pass an object.', paths: null },
  ]);
});

test('it loads each file of a rules list as one rule under its path', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({ rules: ['skills/code/SKILL.md', { path: 'skills/tests/SKILL.md' }] }),
  );

  await Bun.write(
    join(ctx.directory, 'skills/code/SKILL.md'),
    '## Naming\n\n1. Start with a verb.',
  );

  await Bun.write(join(ctx.directory, 'skills/tests/SKILL.md'), '## Naming\n\n1. Start with "it".');

  const loaded = await loadConfig({ repoDir: ctx.directory });

  expect(loaded.rules).toStrictEqual([
    { name: 'skills/code/SKILL.md', body: '## Naming\n\n1. Start with a verb.', paths: null },
    { name: 'skills/tests/SKILL.md', body: '## Naming\n\n1. Start with "it".', paths: null },
  ]);
});

test('it labels the rules of an absolute rules path with the file name alone', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'repo', 'review.json'),
    JSON.stringify({ rules: join(ctx.directory, 'shared', 'patterns.md') }),
  );

  await Bun.write(
    join(ctx.directory, 'shared', 'patterns.md'),
    '## Naming\n\n1. Start with a verb.',
  );

  const loaded = await loadConfig({ repoDir: join(ctx.directory, 'repo') });

  expect(loaded.rules).toStrictEqual([
    { name: 'patterns.md', body: '## Naming\n\n1. Start with a verb.', paths: null },
  ]);
});

test('it fails the load when a rules file entry lists skip', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({ rules: ['a.md', { path: 'b.md', skip: ['Loading the skill'] }] }),
  );

  await Bun.write(join(ctx.directory, 'a.md'), '## Naming\n\n1. Start with a verb.');
  await Bun.write(join(ctx.directory, 'b.md'), '## Naming\n\n1. Start with a verb.');

  expect(loadConfig({ repoDir: ctx.directory })).rejects.toThrowWithMessage(
    Error,
    /rules\.1: Unrecognized key: "skip"/u,
  );
});

test('it replaces an inherited repo: entry that the child writes with a leading ./', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({
      extends: './shared/review.json',
      rules: [{ path: 'repo:./skills/SKILL.md', references: { 'nix.md': ['**/*.nix'] } }],
    }),
  );

  await Bun.write(
    join(ctx.directory, 'shared', 'review.json'),
    JSON.stringify({ rules: ['repo:skills/SKILL.md'] }),
  );

  await Bun.write(join(ctx.directory, 'skills/SKILL.md'), 'Use test.each.');
  await Bun.write(join(ctx.directory, 'skills/nix.md'), 'Boot once.');

  const loaded = await loadConfig({ repoDir: ctx.directory });

  expect(loaded.config.rules).toStrictEqual([
    {
      label: 'skills/SKILL.md',
      path: 'repo:skills/SKILL.md',
      references: { 'nix.md': ['**/*.nix'] },
    },
  ]);
});

test('it appends the rules of a file to the rules it inherits', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({ extends: './shared/review.json', rules: ['skills/project/SKILL.md'] }),
  );

  await Bun.write(
    join(ctx.directory, 'shared', 'review.json'),
    JSON.stringify({ rules: ['code.md', 'tests.md'] }),
  );

  await Bun.write(join(ctx.directory, 'shared', 'code.md'), 'Start a name with a verb.');
  await Bun.write(join(ctx.directory, 'shared', 'tests.md'), 'Title a test with it.');
  await Bun.write(join(ctx.directory, 'skills/project/SKILL.md'), 'Keep the store in one file.');

  const loaded = await loadConfig({ repoDir: ctx.directory });

  expect(loaded.rules?.map((rule) => rule.name)).toStrictEqual([
    'code.md',
    'tests.md',
    'skills/project/SKILL.md',
  ]);
});

test('it replaces an inherited rules entry for the same path with the child entry', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({
      extends: './shared/review.json',
      rules: [{ path: './shared/SKILL.md', references: { 'nix.md': ['**/*.nix'] } }],
    }),
  );

  await Bun.write(
    join(ctx.directory, 'shared', 'review.json'),
    JSON.stringify({ rules: ['SKILL.md'] }),
  );

  await Bun.write(join(ctx.directory, 'shared', 'SKILL.md'), 'Use test.each.');
  await Bun.write(join(ctx.directory, 'shared', 'nix.md'), 'Boot once.');

  const loaded = await loadConfig({ repoDir: ctx.directory });

  expect(loaded.rules?.map((rule) => [rule.body, rule.paths])).toStrictEqual([
    ['Use test.each.', null],
    ['Boot once.', ['**/*.nix']],
  ]);
});

test('it drops the inherited rules when a file sets rules to null', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({ extends: './shared/review.json', rules: null }),
  );

  await Bun.write(
    join(ctx.directory, 'shared', 'review.json'),
    JSON.stringify({ rules: ['code.md'] }),
  );

  await Bun.write(join(ctx.directory, 'shared', 'code.md'), 'Start a name with a verb.');

  const loaded = await loadConfig({ repoDir: ctx.directory });

  expect(loaded.rules).toBeNull();
});

test('it loads each reference of a rules file with the globs that gate it', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({
      rules: [
        { path: 'skills/testing/SKILL.md', references: { 'references/nix.md': ['**/*.nix'] } },
      ],
    }),
  );

  await Bun.write(join(ctx.directory, 'skills/testing/SKILL.md'), '## Loops\n\n1. Use test.each.');

  await Bun.write(
    join(ctx.directory, 'skills/testing/references/nix.md'),
    '## VM tests\n\n1. Boot once.',
  );

  const loaded = await loadConfig({ repoDir: ctx.directory });

  expect(loaded.rules).toStrictEqual([
    { name: 'skills/testing/SKILL.md', body: '## Loops\n\n1. Use test.each.', paths: null },
    {
      name: 'skills/testing/references/nix.md',
      body: '## VM tests\n\n1. Boot once.',
      paths: ['**/*.nix'],
    },
  ]);
});

test('it reads a repo: rules path from the reviewed repo when a remote parent names it', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({ extends: 'github:example/noslop-config' }),
  );

  await Bun.write(
    join(ctx.directory, 'skills/code/SKILL.md'),
    '## Naming\n\n1. Start with a verb.',
  );

  const remoteFiles: Record<string, string> = {
    'review.json': JSON.stringify({ rules: ['repo:skills/code/SKILL.md'] }),
  };

  const loaded = await loadConfig({
    repoDir: ctx.directory,
    readRemoteFile: (location) => Promise.resolve(remoteFiles[location.path] ?? null),
  });

  expect(loaded.rules).toStrictEqual([
    { name: 'skills/code/SKILL.md', body: '## Naming\n\n1. Start with a verb.', paths: null },
  ]);
});

test('it fails the load when a file of the rules list does not exist', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'review.json'), JSON.stringify({ rules: ['missing.md'] }));

  expect(loadConfig({ repoDir: ctx.directory })).rejects.toThrowWithMessage(
    Error,
    /the rules file .*missing\.md does not exist/u,
  );
});

test('it gives 2 rules lists that differ only in a file text 2 hashes', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'review.json'), JSON.stringify({ rules: ['a.md'] }));
  await Bun.write(join(ctx.directory, 'a.md'), '## Naming\n\n1. Start with a verb.');

  const first = await loadConfig({ repoDir: ctx.directory });

  await Bun.write(join(ctx.directory, 'a.md'), '## Naming\n\n1. Start with a noun.');

  const second = await loadConfig({ repoDir: ctx.directory });

  expect(first.hash).not.toBe(second.hash);
});

test('it loads the rules file when the repo directory is a relative path', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'review.json'), JSON.stringify({ rules: './patterns.md' }));

  await Bun.write(
    join(ctx.directory, 'patterns.md'),
    '## No positional booleans\n\n1. Pass an object.',
  );

  const loaded = await loadConfig({ repoDir: relative(process.cwd(), ctx.directory) });

  expect(loaded.rules).toStrictEqual([
    { name: 'patterns.md', body: '## No positional booleans\n\n1. Pass an object.', paths: null },
  ]);
});

test('it fails the load on a cycle in the extends chain', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'review.json'), JSON.stringify({ extends: './a.json' }));
  await Bun.write(join(ctx.directory, 'a.json'), JSON.stringify({ extends: './review.json' }));

  expect(loadConfig({ repoDir: ctx.directory })).rejects.toThrowWithMessage(
    Error,
    /the extends chain has a cycle/u,
  );
});

test('it fails the load when a parent does not exist', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({ extends: './missing.json' }),
  );

  expect(loadConfig({ repoDir: ctx.directory })).rejects.toThrowWithMessage(
    Error,
    /does not exist/u,
  );
});

test('it fails the load when the merged config breaks the schema', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({ lenses: { security: { effort: 'max' } } }),
  );

  expect(loadConfig({ repoDir: ctx.directory })).rejects.toThrowWithMessage(
    Error,
    /lenses\.security\.effort/u,
  );
});

test('it fails the load when a call takes the name of a lens it does not list', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({ calls: { security: ['tests'], intent: ['intent'] } }),
  );

  expect(loadConfig({ repoDir: ctx.directory })).rejects.toThrowWithMessage(
    Error,
    'the merged config is not valid:\ncalls.security: the call security takes the name of the lens security but does not list it; list the lens in the call, or rename the call',
  );
});

test('it loads a file that names its JSON Schema', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({ $schema: './review.schema.json', report: ['json'] }),
  );

  const loaded = await loadConfig({ repoDir: ctx.directory });

  expect(loaded.config.report).toStrictEqual(['json']);
});

test('it gives 2 loads of the same config the same hash', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'review.json'), JSON.stringify({ report: ['json'] }));

  const loads = await Promise.all([
    loadConfig({ repoDir: ctx.directory }),
    loadConfig({ repoDir: ctx.directory }),
  ]);

  expect(loads[0]?.hash).toBe(loads[1]?.hash ?? '');
});

test('it gives 2 checkouts of one commit in 2 folders the same hash', async () => {
  const ctx = await setupTest();

  const checkouts = [join(ctx.directory, 'one'), join(ctx.directory, 'nested', 'two')];

  await Promise.all(
    checkouts.flatMap((directory) => [
      Bun.write(
        join(directory, 'review.json'),
        JSON.stringify({ rules: ['./RULES.md', { path: './docs/style.md' }] }),
      ),
      Bun.write(join(directory, 'RULES.md'), '# Rules\n\nName things well.\n'),
      Bun.write(join(directory, 'docs', 'style.md'), '# Style\n\nKeep it short.\n'),
    ]),
  );

  const loads = await Promise.all(checkouts.map((directory) => loadConfig({ repoDir: directory })));

  expect(loads[0]?.hash).toBe(loads[1]?.hash ?? '');
});

test('it gives a checkout named by an absolute and a relative path the same hash', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'review.json'), JSON.stringify({ rules: './RULES.md' }));
  await Bun.write(join(ctx.directory, 'RULES.md'), '# Rules\n\nName things well.\n');

  const relativeDir = relative(process.cwd(), ctx.directory);

  const loads = await Promise.all([
    loadConfig({ repoDir: ctx.directory }),
    loadConfig({ repoDir: relativeDir }),
  ]);

  expect(loads[0]?.hash).toBe(loads[1]?.hash ?? '');
});

test('it loads no rules from a repo: file or a reference that the repo does not hold', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'review.json'),
    JSON.stringify({
      rules: [
        { path: 'repo:skills/code/SKILL.md', references: { 'references/nix.md': ['**/*.nix'] } },
        'repo:skills/testing/SKILL.md',
      ],
    }),
  );

  await Bun.write(
    join(ctx.directory, 'skills/code/SKILL.md'),
    '## Naming\n\n1. Start with a verb.',
  );

  const loaded = await loadConfig({ repoDir: ctx.directory });

  expect(loaded.rules).toStrictEqual([
    { name: 'skills/code/SKILL.md', body: '## Naming\n\n1. Start with a verb.', paths: null },
  ]);

  expect(loaded.missingRules).toStrictEqual([
    'skills/code/references/nix.md',
    'skills/testing/SKILL.md',
  ]);
});

test('it gives a missing repo: file and an empty one 2 hashes', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'review.json'), JSON.stringify({ rules: ['repo:a.md'] }));

  const missing = await loadConfig({ repoDir: ctx.directory });

  await Bun.write(join(ctx.directory, 'a.md'), '');

  const empty = await loadConfig({ repoDir: ctx.directory });

  expect(missing.hash).not.toBe(empty.hash);
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

  await Bun.write(join(ctx.directory, 'repo', 'review.json'), JSON.stringify(config));
  await Bun.write(join(ctx.directory, 'repo', 'SKILL.md'), '## Naming\n\n1. Start with a verb.');
  await Bun.write(join(ctx.directory, 'outside.md'), '## Outside\n\n1. Read me.');
  await Bun.write(join(ctx.directory, 'x.md'), '## Outside\n\n1. Read me.');

  expect(loadConfig({ repoDir: join(ctx.directory, 'repo') })).rejects.toThrowWithMessage(
    Error,
    /leaves the folder it is relative to/u,
  );
});
