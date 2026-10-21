import type { FixFileEvidence } from '@noslop/contract';
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

  // a fix call of the review judged the finding fixed at the head, so the sha is only a hint
  isJudged: boolean;

  // the review left the finding's own file out of every call, or out of the call of the finding's lens
  isFileSkipped: boolean;

  // a call of the review failed, so the review read no fix in full
  isPartial: boolean;
  coverage: FixCoverage;

  // where the answer stands after the earlier reviews
  held: FixState;

  // the review reported the finding again
  isReported: boolean;

  // what the matched commit's files show, or null when GitHub listed no whole file list of the commit
  // or of the pull request, or the sha names no single commit
  files: FixFileEvidence | null;
}

// the review moves the answer through the fix lifecycle: it rejects a finding it reports again, and
// confirms a fix a fix call judged fixed at the head, or a fix in its range once it read every file
// the fix reaches, with a sha that names one commit changing a file of the pull request
export function buildFixConfirmation(evidence: FixEvidence): FixConfirmation {
  const isRead =
    evidence.isJudged ||
    (evidence.isInRange &&
      !evidence.isFileSkipped &&
      !evidence.isPartial &&
      !evidence.coverage.changesSkipped);

  const state = pickNextFixState(evidence.held, pickReviewVerdict(evidence.isReported, isRead));
  const files = evidence.files;
  const isHeld = (evidence.match !== null || evidence.isJudged) && HELD_FIX_STATES.has(state);

  if (isHeld && (evidence.isJudged || files?.changesPullRequest === true)) {
    return {
      id: evidence.id,
      title: evidence.title,
      commit: evidence.commit,
      fixed: true,
      ...(files === null ? {} : { changesFindingFile: files.changesFindingFile }),
    };
  }

  const failure =
    evidence.coverage.failure ??
    (files?.changesPullRequest === false ? 'the commit changes no file of the pull request' : null);

  return {
    id: evidence.id,
    title: evidence.title,
    commit: evidence.commit,
    fixed: false,
    ...(failure === null ? {} : { failure }),
  };
}

function pickReviewVerdict(isReported: boolean, isRead: boolean): FixVerdict {
  if (isReported) {
    return 'rejected';
  }

  return isRead ? 'confirmed' : 'none';
}
