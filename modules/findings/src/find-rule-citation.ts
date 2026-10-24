import type { Rule } from '@noslop/contract';

export function findRuleCitation(
  rules: readonly Pick<Rule, 'name' | 'body'>[],
  name: string | null,
  quote: string | null,
): string | null {
  const quoted = normalizeWhitespace(quote ?? '').trim();

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

function collectHeadings(markdown: string): { name: string; offset: number }[] {
  const headings: { name: string; offset: number }[] = [];
  let fence: string | null = null;
  let offset = 0;

  for (const line of markdown.split('\n')) {
    const marker = /^\s*(?<marker>`{3,}|~{3,})/u.exec(line)?.groups?.['marker'];

    // CommonMark closes a fence only on a run of its opening character at least as long as the opener
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
