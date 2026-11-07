import { expect, test } from 'bun:test';
import { parseCodexFailure } from './parse-codex-failure';

test('it reads the message of the error events on stdout once', () => {
  const stdout = [
    '{"type":"thread.started","thread_id":"t_1"}',
    '{"type":"turn.started"}',
    '{"type":"error","message":"The quota of this plan is spent until Monday."}',
    '{"type":"turn.failed","error":{"message":"The quota of this plan is spent until Monday."}}',
    '',
  ].join('\n');

  expect(parseCodexFailure(stdout, '')).toBe('The quota of this plan is spent until Monday.');
});

test('it keeps an ERROR line that the stderr tail cuts off', () => {
  const stderr = [
    'ERROR: The quota of this plan is spent until Monday.',
    'y'.repeat(100),
    'x'.repeat(500),
    '',
  ].join('\n');

  expect(parseCodexFailure('', stderr)).toBe(
    `The quota of this plan is spent until Monday.; ${'x'.repeat(500)}`,
  );
});

test('it gives an ERROR line inside the stderr tail only once', () => {
  const stderr = 'warning: sandbox helper missing\nERROR: model unavailable\n';

  expect(parseCodexFailure('', stderr)).toBe(
    'warning: sandbox helper missing\nERROR: model unavailable',
  );
});

test('it gives the stderr tail when stdout holds no error event', () => {
  expect(parseCodexFailure('{"type":"turn.started"}\nnot json\n', 'model unavailable\n')).toBe(
    'model unavailable',
  );
});

test('it gives empty text for a failure with no output', () => {
  expect(parseCodexFailure('', '')).toBe('');
});
