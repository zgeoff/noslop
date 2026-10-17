import { expect, test } from 'bun:test';
import { countCodexTokens } from './count-codex-tokens';

test('it takes the cached share out of the input of each finished turn', () => {
  const stdout = [
    '{"type":"thread.started","thread_id":"t_1"}',
    '{"type":"turn.completed","usage":{"input_tokens":24763,"cached_input_tokens":24448,"cache_write_input_tokens":0,"output_tokens":122,"reasoning_output_tokens":40}}',
    '{"type":"turn.completed","usage":{"input_tokens":1000,"cached_input_tokens":600,"cache_write_input_tokens":300,"output_tokens":20,"reasoning_output_tokens":0}}',
    '',
  ].join('\n');

  expect(countCodexTokens(stdout)).toStrictEqual({
    input: 715,
    cachedInput: 25_048,
    cacheWrite: 300,
    output: 142,
  });
});

test('it counts no cache write from a turn that leaves the count out', () => {
  const stdout =
    '{"type":"turn.completed","usage":{"input_tokens":500,"cached_input_tokens":100,"output_tokens":7}}';

  expect(countCodexTokens(stdout)).toStrictEqual({
    input: 400,
    cachedInput: 100,
    cacheWrite: 0,
    output: 7,
  });
});

test('it skips a line that is not a finished turn', () => {
  const stdout = [
    'not json',
    '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}',
    '{"type":"turn.completed","usage":{"input_tokens":12}}',
  ].join('\n');

  expect(countCodexTokens(stdout)).toStrictEqual({
    input: 0,
    cachedInput: 0,
    cacheWrite: 0,
    output: 0,
  });
});
