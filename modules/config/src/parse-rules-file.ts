export interface Rule {
  name: string;
  body: string;
}

// each level-2 or level-3 heading names one rule, and the lines up to the next such heading are its
// body; a heading inside a fenced code block is example text, not a rule
export function parseRulesFile(markdown: string): Rule[] {
  const rules: Rule[] = [];
  let current: { name: string; lines: string[] } | null = null;
  let inFence = false;

  for (const line of markdown.split('\n')) {
    if (/^\s*(?:```|~~~)/u.test(line)) {
      inFence = !inFence;
    }

    const heading = inFence ? null : /^#{2,3}\s+(?<name>.+?)\s*#*\s*$/u.exec(line);
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
