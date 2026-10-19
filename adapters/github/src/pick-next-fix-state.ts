// where a `fixed` answer stands after the reviews so far: no review has judged it, the newest review
// that judged it read the fix, a later silent review kept that confirmation, or the newest one
// reported the finding again
export type FixState = 'silent' | 'confirmed' | 'retained' | 'rejected';

// one review's word on a `fixed` answer: it read the fix and found the finding gone, it reported the
// finding again, or it had nothing to say about it
export type FixVerdict = 'confirmed' | 'rejected' | 'none';

// the fix lifecycle: each review's verdict moves the answer from one state to the next, so a newer
// verdict replaces every older one in both directions, and a silent review changes nothing it judges
export const FIX_TRANSITIONS: Readonly<Record<FixState, Readonly<Record<FixVerdict, FixState>>>> = {
  silent: { confirmed: 'confirmed', rejected: 'rejected', none: 'silent' },
  confirmed: { confirmed: 'confirmed', rejected: 'rejected', none: 'retained' },
  retained: { confirmed: 'confirmed', rejected: 'rejected', none: 'retained' },
  rejected: { confirmed: 'confirmed', rejected: 'rejected', none: 'rejected' },
};

// the states in which a review's confirmation holds, so the summary marker keeps the fix
export const HELD_FIX_STATES: ReadonlySet<FixState> = new Set(['confirmed', 'retained']);

// the state a review's verdict moves a `fixed` answer to, from the table
export function pickNextFixState(from: FixState, verdict: FixVerdict): FixState {
  return FIX_TRANSITIONS[from][verdict];
}
