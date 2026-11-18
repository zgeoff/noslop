import type { ListedFinding } from '@noslop/contract';

export interface FindingsExpectation {
  open: 'none' | 'some';

  // left out, the fixed findings may number anything
  fixed?: 'some' | undefined;
}

// Why the finding list differs from the journey's end state, or null when it matches. The journey
// checks counts and states, never titles, because the model words its findings anew on each run.
export function findFindingsMismatch(
  findings: readonly Pick<ListedFinding, 'state'>[],
  expectation: FindingsExpectation,
): string | null {
  const open = findings.filter((finding) => finding.state === 'open').length;
  const fixed = findings.filter((finding) => finding.state === 'fixed').length;

  if (expectation.open === 'none' && open > 0) {
    return `${String(open)} findings are open, and the journey expects none`;
  }

  if (expectation.open === 'some' && open === 0) {
    return 'no finding is open, and the journey expects some';
  }

  if (expectation.fixed === 'some' && fixed === 0) {
    return 'no finding is fixed, and the journey expects some';
  }

  return null;
}
