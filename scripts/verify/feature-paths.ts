// Globs are root-relative, as `git ls-files` prints them, and match with Bun.Glob. A package is in a
// feature when the feature's journey runs code in it: a review runs every module but eval, the
// GitHub adapter that posts as the App, and the store that the CLI reads past escapes from.
export const featurePaths = {
  'review-and-fix': [
    'apps/cli/**',
    'modules/config/**',
    'modules/static-stage/**',
    'modules/routing/**',
    'modules/lenses/**',
    'modules/review/**',
    'modules/findings/**',
    'adapters/github/**',
    'adapters/claude/**',
    'adapters/sqlite/**',
    'libs/contract/**',
    'libs/runner/**',
  ],

  // only the adapter: a change to the code both journeys run gets its verdict from review-and-fix
  'review-on-codex': ['adapters/codex/**'],
} as const satisfies Record<string, readonly string[]>;

// A change to one of these changes every feature: the verify CLI, and the dependencies and Bun
// version that every journey runs on.
export const sharedPaths = [
  'scripts/verify/**',
  'package.json',
  'bun.lock',
  '.bun-version',
] as const;

// A path that one of these globs matches counts as no change, even where a feature's or a shared
// glob matches it too, so never write `scripts/**`.
export const ignoredPaths = [
  // 1. Prose. Never `**/*.md`: the lens prompts are markdown that each model call sends.
  'docs/**',
  'README.md',
  '**/README.md',
  'CHANGELOG.md',
  'AGENTS.md',
  'CLAUDE.md',
  'LICENSE',

  // 2. Tests and their helpers.
  '**/*.test.ts',
  '**/src/test-utils/**',
  'libs/testing/**',
  'rig.config.ts',

  // 3. Repo wiring the CLI never reads when it runs. A journey starts the CLI with an empty Bun
  // config, so bunfig.toml is safe here; review.json is noslop's own review config.
  '.agents/**',
  '.claude/**',
  '.codex/**',
  '.editorconfig',
  '.github/**',
  'scripts/*.ts',
  'scripts/*.sh',
  'scripts/release/**',
  'scripts/verify-gate/**',
  'turbo.json',
  'knip.json',
  'tsconfig.json',
  'tsconfig.base.json',
  'tsconfig.cli-types.json',
  '.oxlintrc.json',
  '.oxfmtrc.json',
  '.formatignore',
  '.gitignore',
  '.gitleaks.toml',
  'lefthook.yml',
  'commitlint.config.js',
  'socket.yml',
  'renovate.json',
  'release-please-config.json',
  '.release-please-manifest.json',
  'audit-ignores.json',
  'bunfig.toml',
  'review.json',

  // 4. Code no journey runs, which its own tests cover.
  'modules/eval/**',
  'apps/cli/src/eval/**',
  'adapters/webhook/**',
] as const;
