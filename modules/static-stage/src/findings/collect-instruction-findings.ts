import type { ModelFinding } from '@noslop/contract';
import type { AnalyzedFile } from '../analyzed-file';
import type { InstructionsEntry } from '../types';
import { buildStaticFinding } from './build-static-finding';

const VAGUE_WORDING = /\b(?<word>prefer|usually|where sensible|consider)\b/iu;

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
    const sentencesByLine = splitRuleSentencesByLine(entry.text);

    const others = instruction.loadedBeside.map((path) => ({
      path,
      sentences: new Set(splitRuleSentencesByLine(texts.get(path) ?? '').flat()),
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

      for (const sentence of sentencesByLine[lineNumber - 1] ?? []) {
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

const FENCE_LINE = /^\s*(?<fence>`{3,}|~{3,})/u;

// One entry per line of the text: the rule sentences on it, none inside a fenced block.
function splitRuleSentencesByLine(text: string): string[][] {
  let openFence: string | null = null;

  return text.split('\n').map((line) => {
    const fence = FENCE_LINE.exec(line)?.groups?.['fence'];

    if (openFence !== null) {
      if (fence?.startsWith(openFence[0] ?? '') === true && fence.length >= openFence.length) {
        openFence = null;
      }

      return [];
    }

    if (fence !== undefined) {
      openFence = fence;

      return [];
    }

    return splitRuleSentences(line);
  });
}

const MIN_RULE_WORDS = 5;

function splitRuleSentences(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+\.)\s+/u, ''))
    .flatMap((line) => line.split(/(?<=[.!?])\s+/u))
    .filter((sentence) => !isLinkOnly(sentence))
    .map((sentence) =>
      sentence
        .replaceAll(/[*_`]/gu, '')
        .trim()
        .toLowerCase()
        .replace(/[.!?]$/u, ''),
    )
    .filter((sentence) => sentence.split(/\s+/u).length >= MIN_RULE_WORDS);
}

const MARKDOWN_LINK = /!?\[[^\]]*\]\([^)]*\)/gu;
const LINK_FILLER = /\b(?:see|read|load|also|and|or)\b/giu;

// A sentence is link-only when its text is nothing but links once the links and filler words (see, read, and) are removed.
function isLinkOnly(sentence: string): boolean {
  const withoutLinks = sentence.replaceAll(MARKDOWN_LINK, '');

  if (withoutLinks === sentence) {
    return false;
  }

  return !/[\p{L}\p{N}]/u.test(withoutLinks.replaceAll(LINK_FILLER, ''));
}
