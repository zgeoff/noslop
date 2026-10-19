import type { FixConfirmation } from './format-summary-comment';
import type { FixState, FixVerdict } from './pick-next-fix-state';
import { HELD_FIX_STATES, pickNextFixState } from './pick-next-fix-state';
import type { FixCoverage } from './read-fix-coverage';

// what GitHub shows of one `fixed` answer against one review, read before the decision
export interface FixEvidence {
  id: string;
  title: string;

  // the sha the answer names, and the one branch commit it names, or null for none or several
  commit: string;
  match: string | null;

  // the review's range holds the commit, and the commit comes after the head that posted the finding
  isInRange: boolean;

  // the review left the finding's own file out of every call
  isFileSkipped: boolean;
  coverage: FixCoverage;

  // where the answer stands after the earlier reviews
  held: FixState;

  // the review reported the finding again
  isReported: boolean;
}

// the review moves the answer through the fix lifecycle: it rejects a finding it reports again, and
// confirms a fix whose commit its range holds once it read the finding's file and every file the
// commit reaches; a sha that names no single commit holds no fix
export function buildFixConfirmation(evidence: FixEvidence): FixConfirmation {
  const isRead = evidence.isInRange && !evidence.isFileSkipped && !evidence.coverage.changesSkipped;
  const state = pickNextFixState(evidence.held, pickReviewVerdict(evidence.isReported, isRead));
  const fixed = evidence.match !== null && HELD_FIX_STATES.has(state);
  const failure = evidence.coverage.failure;

  return {
    id: evidence.id,
    title: evidence.title,
    commit: evidence.commit,
    fixed,
    ...(fixed || failure === null ? {} : { failure }),
  };
}

function pickReviewVerdict(isReported: boolean, isRead: boolean): FixVerdict {
  if (isReported) {
    return 'rejected';
  }

  return isRead ? 'confirmed' : 'none';
}
