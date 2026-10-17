export interface RuleSection {
  name: string;
  body: string;
}

// each level-2 or level-3 heading names one rule, and the lines up to the next such heading are its
// body; a heading inside a fenced code block is example text, not a rule
export function parseRulesFile(markdown: string): RuleSection[] {
  const rules: RuleSection[] = [];
  let current: { name: string; lines: string[] } | null = null;
  let fence: string | null = null;

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

    const heading = fence === null ? /^#{2,3}\s+(?<name>.+?)\s*#*\s*$/u.exec(line) : null;
    const name = heading?.groups?.['name'];

    if (name !== undefined) {
      if (current !== null) {
        rules.push({ name: current.name, body: current.lines.join('\n').trim() });
      }

      current = { name, lines: [] };
      continue;
    }

    current?.lines.push(line);
  }

  if (current !== null) {
    rules.push({ name: current.name, body: current.lines.join('\n').trim() });
  }

  return rules;
}
