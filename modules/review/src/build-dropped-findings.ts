import type { DroppedFinding } from '@noslop/contract';
import type { AssembledFindings, DismissedFindingsSplit } from '@noslop/findings';

// the findings a review dropped, as the result lists them: each one a finding rule threw away, with
// the rule and the quote it cited, so the store shows whether the quote check drops real findings,
// then each one that matched a finding answered `not-a-defect`, with the ID of that finding
export function buildDroppedFindings(
  assembled: AssembledFindings['dropped'],
  dismissed: DismissedFindingsSplit['dismissed'],
): DroppedFinding[] {
  return [
    ...assembled.map((item): DroppedFinding => ({
      lens: item.raw.lens,
      callID: item.raw.callID,
      title: item.raw.finding.title,
      anchor: item.raw.finding.anchor,
      criterion: item.raw.finding.criterion,
      reason: item.reason,
      rule: item.raw.finding.rule,
      ruleQuote: item.raw.finding.ruleQuote,
    })),
    ...dismissed.map((item): DroppedFinding => ({
      lens: item.finding.lens,
      callID: item.finding.callID,
      title: item.finding.title,
      anchor: item.finding.anchor,
      criterion: item.finding.criterion,
      reason: 'answered-not-a-defect',
      rule: item.finding.rule ?? null,
      ruleQuote: null,
      answeredID: item.answeredID,
    })),
  ];
}
