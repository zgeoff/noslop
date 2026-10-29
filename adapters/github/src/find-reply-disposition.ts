import { collectAnswerLines } from './collect-answer-lines';
import type { ParsedDisposition } from './parse-disposition';
import { parseDisposition } from './parse-disposition';

export function findReplyDisposition(reply: string, findingID: string): ParsedDisposition | null {
  const lines = collectAnswerLines(reply);

  if (lines.length === 0) {
    return parseDisposition(reply);
  }

  const answers = lines.map((line) => ({
    findingID: line.findingID,
    disposition: line.answer === null ? null : parseDisposition(line.answer),
  }));

  if (answers.some((answer) => answer.disposition === null)) {
    return null;
  }

  return answers.findLast((answer) => answer.findingID === findingID)?.disposition ?? null;
}
