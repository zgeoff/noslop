import type { Rule } from '@noslop/contract';

// the rule a taste finding cites, as the finding stores it: the file's label, then the nearest level-2
// or level-3 heading above the quote, which labels the yield of each rule; null when the finding names
// no rules file or quotes nothing that file holds, compared with whitespace collapsed and case kept
export function findRuleCitation(
  rules: readonly Pick<Rule, 'name' | 'body'>[],
  name: string | null,
  quote: string | null,
): string | null {
  const quoted = normalizeWhitespace(quote ?? '').trim();

  // 2 files of one extends chain can share a label, so the quote may sit in any file under it
  const rule = rules.find(
    (candidate) =>
      candidate.name === name &&
      quoted !== '' &&
      normalizeWhitespace(candidate.body).includes(quoted),
  );

  if (rule === undefined) {
    return null;
  }

  const at = normalizeWhitespace(rule.body).indexOf(quoted);

  const heading = collectHeadings(rule.body).findLast(
    (candidate) => normalizeWhitespace(rule.body.slice(0, candidate.offset)).length <= at,
  );

  return heading === undefined ? rule.name : `${rule.name}: ${heading.name}`;
}

function normalizeWhitespace(text: string): string {
  return text.replaceAll(/\s+/gu, ' ');
}

// each level-2 or level-3 heading and where its line starts; a heading inside a fenced code block is
// example text, not a heading of the file
function collectHeadings(markdown: string): { name: string; offset: number }[] {
  const headings: { name: string; offset: number }[] = [];
  let fence: string | null = null;
  let offset = 0;

  for (const line of markdown.split('\n')) {
    const marker = /^\s*(?<marker>`{3,}|~{3,})/u.exec(line)?.groups?.['marker'];

    // a fence closes only on a run of its own character at least as long as the one that opened it
    if (marker !== undefined && fence === null) {
      fence = marker;
    } else if (
      marker !== undefined &&
      fence !== null &&
      marker.startsWith(fence.charAt(0)) &&
      marker.length >= fence.length
    ) {
      fence = null;
    }

    const name =
      fence === null ? /^#{2,3}\s+(?<name>.+?)\s*#*\s*$/u.exec(line)?.groups?.['name'] : undefined;

    if (name !== undefined) {
      headings.push({ name, offset });
    }

    offset += line.length + 1;
  }

  return headings;
}
