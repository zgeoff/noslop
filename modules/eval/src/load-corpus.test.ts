import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCorpus } from './load-corpus';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-corpus-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it loads each case folder in name order', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'b-case', 'case.json'),
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
    join(ctx.directory, 'a-case', 'case.json'),
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

  await mkdir(join(ctx.directory, 'not-a-case'));

  const cases = await loadCorpus(ctx.directory);

  expect(cases.map((corpusCase) => corpusCase.id)).toStrictEqual(['a-case', 'b-case']);
});

test('it loads the last reviewed head and the linked issue of a re-review case', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'push', 'case.json'),
    JSON.stringify({
      id: 'push',
      repo: '/repos/app',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      reviewedHead: 'c'.repeat(40),
      title: 'feat: add the queue',
      body: 'Adds src/queue.ts and src/worker.ts.',
      linkedIssue: 'Add a queue and a worker that drains it.',
      findings: [],
      escapes: [],
    }),
  );

  const cases = await loadCorpus(ctx.directory);

  expect(cases).toStrictEqual([
    {
      id: 'push',
      repo: '/repos/app',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      reviewedHead: 'c'.repeat(40),
      title: 'feat: add the queue',
      body: 'Adds src/queue.ts and src/worker.ts.',
      linkedIssue: 'Add a queue and a worker that drains it.',
      findings: [],
      escapes: [],
    },
  ]);
});

test('it loads the silences a case expects, with and without an anchor', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'quiet', 'case.json'),
    JSON.stringify({
      id: 'quiet',
      repo: '/repos/app',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      title: 'feat: add the queue',
      body: '',
      findings: [],
      escapes: [],
      silences: [
        { lens: 'intent', reason: 'The body names files an earlier push changed' },
        {
          lens: 'design',
          anchor: { path: 'src/queue.ts', startLine: 3, endLine: 9 },
          reason: 'The queue keeps the shape the issue asks for',
        },
      ],
    }),
  );

  const cases = await loadCorpus(ctx.directory);

  expect(cases).toStrictEqual([
    {
      id: 'quiet',
      repo: '/repos/app',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      title: 'feat: add the queue',
      body: '',
      findings: [],
      escapes: [],
      silences: [
        { lens: 'intent', reason: 'The body names files an earlier push changed' },
        {
          lens: 'design',
          anchor: { path: 'src/queue.ts', startLine: 3, endLine: 9 },
          reason: 'The queue keeps the shape the issue asks for',
        },
      ],
    },
  ]);
});

test('it rejects a silence that names no lens a finding can carry', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'bad', 'case.json'),
    JSON.stringify({
      id: 'bad',
      repo: '/repos/app',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      title: 'feat: bad',
      body: '',
      findings: [],
      escapes: [],
      silences: [{ lens: 'description', reason: 'The body names files an earlier push changed' }],
    }),
  );

  expect(loadCorpus(ctx.directory)).rejects.toThrowWithMessage(Error, /silences/u);
});

test('it rejects a last reviewed head that is not a full commit sha', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'bad', 'case.json'),
    JSON.stringify({
      id: 'bad',
      repo: '/repos/app',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      reviewedHead: 'main',
      title: 'feat: bad',
      body: '',
      findings: [],
      escapes: [],
    }),
  );

  expect(loadCorpus(ctx.directory)).rejects.toThrowWithMessage(Error, /reviewedHead/u);
});

test('it rejects a case that does not match the case schema', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'bad', 'case.json'),
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

  expect(loadCorpus(ctx.directory)).rejects.toThrowWithMessage(
    Error,
    /case bad is not a valid case/u,
  );
});
