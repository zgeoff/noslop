export interface AnswerLine {
  findingID: string;
  answer: string;
}

const ANSWER_LINE = /^(?<id>[0-9a-f]{16})\s+(?<answer>\S.*)$/u;

export function collectAnswerLines(reply: string): AnswerLine[] {
  const lines: AnswerLine[] = [];

  for (const line of reply.trim().split('\n')) {
    const match = ANSWER_LINE.exec(line.trim());
    const findingID = match?.groups?.['id'];
    const answer = match?.groups?.['answer'];

    if (findingID === undefined || answer === undefined) {
      break;
    }

    lines.push({ findingID, answer });
  }

  return lines;
}
