// one review's word on a `fixed` answer: it read the fix and found the finding gone, it reported the
// finding again, or it had nothing to say about it
export type FixVerdict = 'confirmed' | 'rejected' | 'none';

// a newer verdict on a finding replaces every older one, in both directions, so the newest review in
// order of range that confirmed or rejected the fix decides
export function pickFixVerdict(verdicts: readonly FixVerdict[]): FixVerdict {
  return verdicts.find((verdict) => verdict !== 'none') ?? 'none';
}
