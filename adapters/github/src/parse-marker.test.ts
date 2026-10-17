import { expect, test } from 'bun:test';
import { z } from 'zod';
import { formatMarker } from './format-marker';
import { parseMarker } from './parse-marker';

test('it reads back the state that a marker holds, a title that ends a comment included', () => {
  const body = `Some text\n\n${formatMarker('finding', { id: 'a', title: 'Stop at --> here' })}`;
  const schema = z.object({ id: z.string(), title: z.string() });

  expect(parseMarker('finding', schema, body)).toStrictEqual({
    id: 'a',
    title: 'Stop at --> here',
  });
});

test('it writes no comment end inside a marker, so a title holding } --> reads back whole', () => {
  const marker = formatMarker('finding', { id: 'a', title: 'Escape } --> in markers' });
  const schema = z.object({ id: z.string(), title: z.string() });

  expect(marker).not.toInclude('} -->"');

  expect(parseMarker('finding', schema, marker)).toStrictEqual({
    id: 'a',
    title: 'Escape } --> in markers',
  });
});

test('it returns null for a comment with no marker of the kind', () => {
  expect(parseMarker('summary', z.object({}), formatMarker('finding', { id: 'a' }))).toBeNull();
});

test('it returns null for a marker whose state does not match the schema', () => {
  const schema = z.object({ id: z.number() });

  expect(parseMarker('finding', schema, formatMarker('finding', { id: 'a' }))).toBeNull();
});

test('it returns null for a marker that holds broken JSON', () => {
  expect(parseMarker('finding', z.object({}), '<!-- noslop:finding {"id": } -->')).toBeNull();
});
