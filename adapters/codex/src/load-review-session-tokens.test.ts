import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReviewSessionTokens } from './load-review-session-tokens';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-codex-sessions-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it sums the last count of the review thread and each thread it started', async () => {
  const ctx = await setupTest();

  const day = join(ctx.dir, 'sessions', '2026', '10', '18');

  await Bun.write(
    join(day, 'rollout-parent.jsonl'),
    [
      '{"type":"session_meta","payload":{"id":"t_parent","source":"exec"}}',
      '{"type":"event_msg","payload":{"type":"task_started"}}',
    ].join('\n'),
  );

  await Bun.write(
    join(day, 'rollout-child.jsonl'),
    [
      '{"type":"session_meta","payload":{"id":"t_child","parent_thread_id":"t_parent"}}',
      '{"type":"event_msg","payload":{"type":"token_count","info":null}}',
      '{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":20000,"cached_input_tokens":15000,"cache_write_input_tokens":0,"output_tokens":300}}}}',
      '{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":43922,"cached_input_tokens":29312,"cache_write_input_tokens":0,"output_tokens":650}}}}',
      '{"type":"event_msg","payload":{"type":"token_count","info":null}}',
    ].join('\n'),
  );

  await Bun.write(
    join(day, 'rollout-other.jsonl'),
    [
      '{"type":"session_meta","payload":{"id":"t_other_child","parent_thread_id":"t_other"}}',
      '{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":9000,"cached_input_tokens":0,"output_tokens":90}}}}',
    ].join('\n'),
  );

  const tokens = await loadReviewSessionTokens({
    codexHome: ctx.dir,
    threadID: 't_parent',
    since: new Date(2026, 9, 17).getTime(),
  });

  expect(tokens).toStrictEqual({ input: 14_610, cachedInput: 29_312, cacheWrite: 0, output: 650 });
});

test('it skips a session file written before the review started', async () => {
  const ctx = await setupTest();

  const file = join(ctx.dir, 'sessions', '2026', '10', '18', 'rollout-child.jsonl');

  await Bun.write(
    file,
    [
      '{"type":"session_meta","payload":{"id":"t_child","parent_thread_id":"t_parent"}}',
      '{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":500,"cached_input_tokens":100,"output_tokens":5}}}}',
    ].join('\n'),
  );

  await utimes(file, new Date(2026, 9, 16), new Date(2026, 9, 16));

  expect(
    loadReviewSessionTokens({
      codexHome: ctx.dir,
      threadID: 't_parent',
      since: new Date(2026, 9, 17).getTime(),
    }),
  ).rejects.toThrowWithMessage(Error, 'codex wrote no review session for thread t_parent');
});

test('it rejects a review with no session of a thread it started', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'sessions', '2026', '10', '18', 'rollout-parent.jsonl'),
    '{"type":"session_meta","payload":{"id":"t_parent","source":"exec"}}',
  );

  expect(
    loadReviewSessionTokens({
      codexHome: ctx.dir,
      threadID: 't_parent',
      since: new Date(2026, 9, 17).getTime(),
    }),
  ).rejects.toThrowWithMessage(Error, 'codex wrote no review session for thread t_parent');
});
