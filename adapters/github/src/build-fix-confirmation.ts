import type { FixConfirmation } from './format-summary-comment';
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

  // an earlier review confirmed this fix
  isHeld: boolean;

  // the review reported the finding again
  isReported: boolean;
}

// a `fixed` finding is confirmed while no review reports it again, once a review whose range holds the
// fix commit has read the fix: the finding's file and every file the commit reaches; a fix outside the
// range keeps the earlier review's word
export function buildFixConfirmation(evidence: FixEvidence): FixConfirmation {
  const isRead = evidence.isInRange && !evidence.isFileSkipped && !evidence.coverage.changesSkipped;
  const fixed = !evidence.isReported && evidence.match !== null && (isRead || evidence.isHeld);
  const failure = evidence.coverage.failure;

  return {
    id: evidence.id,
    title: evidence.title,
    commit: evidence.commit,
    fixed,
    ...(fixed || failure === null ? {} : { failure }),
  };
}
