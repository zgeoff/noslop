import type { z } from 'zod';
import type { MarkerKind } from './format-marker';

// the App ends each comment with its marker, and text before it, such as a title or a file path,
// comes from the change, so only a marker that ends the comment holds state
const MARKER_START = '<!-- noslop:';

export function parseMarker<Schema extends z.ZodType>(
  kind: MarkerKind,
  schema: Schema,
  body: string,
): z.infer<Schema> | null {
  const tail = body.slice(body.lastIndexOf(MARKER_START));

  const match = new RegExp(`^<!-- noslop:${kind} (\\{.*\\}) -->\\s*$`, 'su').exec(tail);

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
