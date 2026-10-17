import type { ReviewResult } from '@noslop/contract';
import type { Store } from './load-store';

// writes one review with its calls and findings in one transaction, so a reader never sees a review
// without its findings; each finding keeps the depth, model and effort of the call that reported it
export async function writeReview(store: Store, result: ReviewResult): Promise<void> {
  const calls = new Map(result.calls.map((call) => [call.id, call]));

  await store.transaction().execute(async (trx) => {
    await trx
      .insertInto('reviews')
      .values({
        review_id: result.reviewID,
        repo: result.repo,
        pull_request: result.pullRequest?.number ?? null,
        base: result.base,
        head: result.head,
        title: result.title,
        depth: result.depth,
        stepped_up_from: result.steppedUpFrom,
        special: result.special,
        risk_classes: JSON.stringify(result.riskClasses),
        lenses: JSON.stringify(result.lenses),
        config_hash: result.configHash,
        started_at: result.startedAt,
        ended_at: result.endedAt,
      })
      .execute();

    if (result.calls.length > 0) {
      await trx
        .insertInto('calls')
        .values(
          result.calls.map((call) => ({
            review_id: result.reviewID,
            call_id: call.id,
            lenses: JSON.stringify(call.lenses),
            depth: call.depth,
            adapter: call.adapter,
            model: call.model,
            effort: call.effort,
            status: call.status,
            attempts: call.attempts,
            input_tokens: call.tokens.input,
            cached_input_tokens: call.tokens.cachedInput,
            cache_write_tokens: call.tokens.cacheWrite,
            output_tokens: call.tokens.output,
            duration_ms: call.durationMs,
          })),
        )
        .execute();
    }

    if (result.findings.length > 0) {
      await trx
        .insertInto('findings')
        .values(
          result.findings.map((finding) => {
            const call = finding.callID === null ? undefined : calls.get(finding.callID);

            return {
              review_id: result.reviewID,
              finding_id: finding.id,
              lens: finding.lens,
              call_id: finding.callID,
              title: finding.title,
              body: finding.body,
              path: finding.anchor.path,
              start_line: finding.anchor.startLine,
              end_line: finding.anchor.endLine,
              second_location:
                finding.secondLocation === undefined
                  ? null
                  : JSON.stringify(finding.secondLocation),
              severity: finding.severity,
              criterion: finding.criterion,
              rule: finding.rule ?? null,
              verdict: finding.verdict,
              unverified_fact: finding.unverifiedFact ?? null,
              written_by_change: finding.writtenByChange ? 1 : 0,
              risk_class: finding.riskClass ?? null,
              fix: finding.fix ?? null,
              depth: call?.depth ?? result.depth,
              model: call?.model ?? null,
              effort: call?.effort ?? null,
            };
          }),
        )
        .execute();
    }
  });
}
