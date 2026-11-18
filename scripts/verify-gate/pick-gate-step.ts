import { z } from 'zod';

const refSchema = z.object({ ref: z.string().min(1) });
const userSchema = z.object({ type: z.string(), login: z.string() });

const pullRequestSchema = z.object({
  body: z.string().nullable(),
  base: refSchema,
  head: refSchema,
  user: userSchema,
});

const pullRequestEventSchema = z.object({ pull_request: pullRequestSchema });

export type GateStep =
  | { readonly kind: 'skip'; readonly reason: string }
  | { readonly kind: 'gate'; readonly baseRef: string; readonly body: string }
  | { readonly kind: 'refused'; readonly message: string };

// The bots whose pull requests nobody runs a journey on: each changes only versions, a changelog or
// files that zgeoff/tools delivers. Each matches on its branch prefix and its REST login, as a
// pull_request event names them, so a person's branch with the same prefix still meets the gate.
const skippedBots = [
  { prefix: 'renovate/', login: 'zgeoff-renovate[bot]', what: 'a renovate pull request' },
  {
    prefix: 'release-please--branches--main',
    login: 'zgeoff-release-bot[bot]',
    what: 'a release pull request',
  },
  { prefix: 'repo-sync/', login: 'zgeoff-sync-bot[bot]', what: 'a repo-sync pull request' },
] as const;

// What the `verify / gate` step does for one pull_request event.
export function pickGateStep(event: unknown): GateStep {
  const parsed = pullRequestEventSchema.safeParse(event);

  if (!parsed.success) {
    return {
      kind: 'refused',
      message: 'the event holds no pull request; run this on pull_request',
    };
  }

  const pullRequest = parsed.data.pull_request;

  const bot = skippedBots.find(
    (candidate) =>
      pullRequest.user.type === 'Bot' &&
      pullRequest.user.login === candidate.login &&
      pullRequest.head.ref.startsWith(candidate.prefix),
  );

  if (bot !== undefined) {
    return { kind: 'skip', reason: `${bot.what} carries no verify report` };
  }

  return { kind: 'gate', baseRef: pullRequest.base.ref, body: pullRequest.body ?? '' };
}
