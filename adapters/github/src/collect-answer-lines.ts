export interface AnswerLine {
  findingID: string;
  answer: string | null;
}

const ANSWER_LINE = /^(?<id>[0-9a-f]{16})(?:\s+(?<answer>\S.*))?$/u;

export function collectAnswerLines(reply: string): AnswerLine[] {
  const lines: AnswerLine[] = [];

  for (const line of reply.trim().split('\n')) {
    const match = ANSWER_LINE.exec(line.trim());
    const findingID = match?.groups?.['id'];

    if (findingID === undefined) {
      break;
    }

    lines.push({ findingID, answer: match?.groups?.['answer'] ?? null });
  }

  return lines;
}
