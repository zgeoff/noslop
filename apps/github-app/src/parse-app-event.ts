import { z } from 'zod';

// what the App does for one webhook delivery: review a pull request's new head, or set its check
// again after a reply
export interface AppEvent {
  kind: 'review' | 'check';
  owner: string;
  repo: string;
  number: number;
  installationID: number;
}

const REVIEW_ACTIONS = new Set(['opened', 'synchronize', 'reopened', 'ready_for_review']);

const ownerSchema = z.looseObject({ login: z.string() });

const payloadSchema = z.looseObject({
  action: z.string(),
  installation: z.looseObject({ id: z.int() }),
  repository: z.looseObject({ name: z.string(), owner: ownerSchema }),
  sender: z.looseObject({ type: z.string() }),
  pull_request: z.looseObject({ number: z.int(), draft: z.boolean().optional() }).optional(),
  issue: z.looseObject({ number: z.int(), pull_request: z.looseObject({}).optional() }).optional(),
});

// a delivery as an App event, or null for one the App leaves be: another event, a draft, a comment
// on an issue that is no pull request, or a comment a bot wrote, the App's own included
export function parseAppEvent(name: string, payload: unknown): AppEvent | null {
  const parsed = payloadSchema.safeParse(payload);

  if (!parsed.success || parsed.data.sender.type === 'Bot') {
    return null;
  }

  const data = parsed.data;

  const base = {
    owner: data.repository.owner.login,
    repo: data.repository.name,
    installationID: data.installation.id,
  };

  if (name === 'pull_request' && data.pull_request !== undefined) {
    const isReview = REVIEW_ACTIONS.has(data.action) && data.pull_request.draft !== true;

    return isReview ? { kind: 'review', number: data.pull_request.number, ...base } : null;
  }

  if (name === 'pull_request_review_comment' && data.pull_request !== undefined) {
    return data.action === 'created'
      ? { kind: 'check', number: data.pull_request.number, ...base }
      : null;
  }

  if (name === 'issue_comment' && data.issue?.pull_request !== undefined) {
    return data.action === 'created' ? { kind: 'check', number: data.issue.number, ...base } : null;
  }

  return null;
}
