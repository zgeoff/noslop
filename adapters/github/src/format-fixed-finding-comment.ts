import type { FindingMarker } from './finding-marker';
import { formatFindingHeading } from './format-finding-heading';

const FINDING_MARKER_START = '<!-- noslop:finding ';
const ORIGINAL_OPEN = '<details><summary>Original finding</summary>\n\n';
const ORIGINAL_CLOSE = '\n</details>\n';

// a finding comment as its fix stands: with a confirmed fix commit, the heading struck through, the
// commit, and the posted comment collapsed under them; with none, the comment as posted, so a fix that
// stops holding opens the finding again; the marker stays byte for byte either way
export function formatFixedFindingComment(
  body: string,
  marker: FindingMarker,
  commit: string | null,
): string {
  const start = body.lastIndexOf(FINDING_MARKER_START);
  const isStruck = body.startsWith('~~');

  if (start === -1 || isStruck === (commit !== null)) {
    return body;
  }

  if (commit === null) {
    const open = body.indexOf(ORIGINAL_OPEN);
    const close = start - ORIGINAL_CLOSE.length;

    if (open === -1 || body.slice(close, start) !== ORIGINAL_CLOSE) {
      return body;
    }

    return `${body.slice(open + ORIGINAL_OPEN.length, close)}\n${body.slice(start)}`;
  }

  return [
    `~~${formatFindingHeading(marker.severity, marker.lens, marker.title)}~~`,
    `✅ Fixed in \`${commit.slice(0, 7)}\``,
    '',
    ORIGINAL_OPEN.trimEnd(),
    '',
    body.slice(0, start).trimEnd(),
    '</details>',
    body.slice(start),
  ].join('\n');
}
