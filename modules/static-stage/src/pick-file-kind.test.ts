import { expect, test } from 'bun:test';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import { pickFileKind } from './pick-file-kind';
import type { FileKind } from './types';

test.each<[string, FileKind]>([
  ['src/queue.ts', 'code'],
  ['src/queue.test.ts', 'test'],
  ['e2e/review.ts', 'test'],
  ['scripts/deploy.sh', 'code'],
  ['docs/guide.md', 'prose'],
  ['README.md', 'prose'],
  ['AGENTS.md', 'instructions'],
  ['.claude/skills/testing/SKILL.md', 'instructions'],
  ['.github/workflows/ci.yml', 'infra'],
  ['Dockerfile', 'infra'],
  ['deploy/api/config.yaml', 'infra'],
  ['package.json', 'config'],
  ['logo.png', 'other'],
])('it sorts %s as %s', (path, kind) => {
  expect(pickFileKind(path, BUILT_IN_DEFAULTS)).toBe(kind);
});
