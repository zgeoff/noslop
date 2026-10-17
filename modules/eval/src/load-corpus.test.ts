import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCorpus } from './load-corpus';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-corpus-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it loads each case folder in name order', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'b-case', 'case.json'),
    JSON.stringify({
      id: 'b-case',
      repo: '/repos/app',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      title: 'feat: b',
      body: '',
      findings: [],
      escapes: [],
    }),
  );

  await Bun.write(
    join(ctx.dir, 'a-case', 'case.json'),
    JSON.stringify({
      id: 'a-case',
      repo: '/repos/app',
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
      title: 'feat: a',
      body: '',
      findings: [],
      escapes: [],
    }),
  );

  await mkdir(join(ctx.dir, 'not-a-case'));

  const cases = await loadCorpus(ctx.dir);

  expect(cases.map((corpusCase) => corpusCase.id)).toStrictEqual(['a-case', 'b-case']);
});

test('it rejects a case that does not match the case schema', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'bad', 'case.json'),
    JSON.stringify({
      id: 'bad',
      repo: '/repos/app',
      base: 'main',
      head: 'b'.repeat(40),
      title: 'feat: bad',
      body: '',
      findings: [],
      escapes: [],
    }),
  );

  expect(loadCorpus(ctx.dir)).rejects.toThrowWithMessage(Error, /case bad is not a valid case/u);
});
