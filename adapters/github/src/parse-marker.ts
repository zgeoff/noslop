import type { z } from 'zod';
import type { MarkerKind } from './format-marker';

export function parseMarker<Schema extends z.ZodType>(
  kind: MarkerKind,
  schema: Schema,
  body: string,
): z.infer<Schema> | null {
  const match = new RegExp(`<!-- noslop:${kind} (\\{.*?\\}) -->`, 'su').exec(body);

  if (match?.[1] === undefined) {
    return null;
  }

  const parsed = schema.safeParse(parseJSON(match[1]));

  return parsed.success ? parsed.data : null;
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
