import type { ModelFinding } from '@noslop/contract';
import type { AnalyzedFile } from './analyzed-file';
import { buildStaticFinding } from './build-static-finding';
import type { InstructionsEntry } from './types';

const VAGUE_WORDING = /\b(?<word>prefer|usually|where sensible|consider)\b/iu;
const MIN_RULE_WORDS = 5;

// the direct findings about agent instruction files: a new rule sentence that another instruction
// file loaded beside it already holds, and a new rule that leaves the agent a vague choice
export function collectInstructionFindings(
  files: readonly AnalyzedFile[],
  instructions: readonly InstructionsEntry[],
): ModelFinding[] {
  const texts = new Map(
    files.flatMap((entry) => (entry.text === null ? [] : [[entry.file.path, entry.text]])),
  );

  const findings: ModelFinding[] = [];

  for (const instruction of instructions) {
    const entry = files.find((file) => file.file.path === instruction.path);

    if (entry === undefined || entry.text === null) {
      continue;
    }

    const lines = entry.text.split('\n');

    const others = instruction.loadedBeside.map((path) => ({
      path,
      sentences: new Set(splitRuleSentences(texts.get(path) ?? '')),
    }));

    for (const lineNumber of [...entry.lines.added].toSorted((left, right) => left - right)) {
      const line = lines[lineNumber - 1] ?? '';
      const anchor = { path: instruction.path, startLine: lineNumber, endLine: lineNumber };
      const vague = VAGUE_WORDING.exec(line)?.groups?.['word'];

      if (vague !== undefined) {
        findings.push(
          buildStaticFinding({
            title: `Instruction rule leaves a choice open with "${vague.toLowerCase()}"`,
            body: `"${vague}" lets an agent read the rule either way, so 2 runs can follow it differently.`,
            anchor,
            criterion: 'documentation-prose',
            fix: 'State when the rule applies and what to do, with no word that leaves the choice open.',
          }),
        );
      }

      for (const sentence of splitRuleSentences(line)) {
        const twin = others.find((other) => other.sentences.has(sentence));

        if (twin !== undefined) {
          findings.push(
            buildStaticFinding({
              title: 'Instruction rule repeats a rule from another loaded file',
              body: `${twin.path} holds the same rule, and an agent loads both files, so a later edit to one copy leaves the 2 in conflict.`,
              anchor,
              criterion: 'instruction-conflict',
              fix: `Keep the rule in one file, and link to it from the other.`,
            }),
          );
        }
      }
    }
  }

  return findings;
}

// a rule sentence is a sentence of a line with the list marker and the Markdown emphasis gone,
// lowercased; a sentence of fewer than a few words is a heading or a label, never a rule
function splitRuleSentences(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+\.)\s+/u, '').replaceAll(/[*_`]/gu, ''))
    .flatMap((line) => line.split(/(?<=[.!?])\s+/u))
    .map((sentence) =>
      sentence
        .trim()
        .toLowerCase()
        .replace(/[.!?]$/u, ''),
    )
    .filter((sentence) => sentence.split(/\s+/u).length >= MIN_RULE_WORDS);
}
