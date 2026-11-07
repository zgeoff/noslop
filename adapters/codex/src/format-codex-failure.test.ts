import { expect, test } from 'bun:test';
import { formatCodexFailure } from './format-codex-failure';

test('it gives the message of the error events on stdout once', () => {
  const stdout = [
    '{"type":"thread.started","thread_id":"t_1"}',
    '{"type":"turn.started"}',
    '{"type":"error","message":"The quota of this plan is spent until Monday."}',
    '{"type":"turn.failed","error":{"message":"The quota of this plan is spent until Monday."}}',
    '',
  ].join('\n');

  expect(formatCodexFailure(stdout, '')).toBe('The quota of this plan is spent until Monday.');
});

test('it gives an ERROR line before the stderr tail that would cut it off', () => {
  const stderr = [
    'ERROR: The quota of this plan is spent until Monday.',
    'y'.repeat(100),
    'x'.repeat(500),
    '',
  ].join('\n');

  expect(formatCodexFailure('', stderr)).toBe(
    `The quota of this plan is spent until Monday.; ${'x'.repeat(500)}`,
  );
});

test('it gives an ERROR line once, ahead of the rest of stderr', () => {
  const stderr = 'warning: sandbox helper missing\nERROR: model unavailable\n';

  expect(formatCodexFailure('', stderr)).toBe('model unavailable; warning: sandbox helper missing');
});

test('it gives a message that both stdout and stderr hold once', () => {
  const stdout = '{"type":"error","message":"model unavailable"}\n';

  expect(formatCodexFailure(stdout, 'ERROR: model unavailable\n')).toBe('model unavailable');
});

test('it keeps the last 500 characters of many error messages', () => {
  const stdout = Array.from(
    { length: 30 },
    (_, index) => `{"type":"error","message":"Reconnecting to the model, try ${index + 1} of 30"}`,
  ).join('\n');

  expect(formatCodexFailure(stdout, '')).toMatch(
    /^.{461}Reconnecting to the model, try 30 of 30$/su,
  );
});

test('it gives the stderr tail when stdout holds no error event', () => {
  expect(formatCodexFailure('{"type":"turn.started"}\nnot json\n', 'model unavailable\n')).toBe(
    'model unavailable',
  );
});

test('it gives empty text for a failure with no output', () => {
  expect(formatCodexFailure('', '')).toBe('');
});
